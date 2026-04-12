import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden, notFound, err, serverError } from "@/lib/api-utils";
import { searchForArticles } from "@/lib/agent/search";
import { fetchArticles } from "@/lib/agent/fetch";
import { estimateCost, DEFAULT_MODEL } from "@/lib/agent/claude-client";

export const dynamic = "force-dynamic";
// Allow this route to run for up to 5 minutes — search loops up to 10
// rounds and each round can take 20-30s with web_search tool use.
export const maxDuration = 300;

// POST /api/agent/process/[id]
// -----------------------------
// Advances a queued agent run through the pipeline phases. Currently
// runs search + fetch; analyze and synthesize come in slices C and D.
// On completion the run is in 'analyzing' status (the next holding
// state) with article texts stored in the batch JSONB.
//
// Phase progression:
//   queued    → searching → fetching → analyzing → synthesizing → ready
//   ↑ start    ↑ search    ↑ fetch    ↑ holding   ↑ holding      ↑ done
//
// Admin-gated. Currently invoked manually for testing. The final slice
// will fire it automatically (fire-and-forget) after POST /api/agent/run.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  // Load the run, scoped to owner
  const loadResult = await sql`
    SELECT id, user_id, thesis, scope, status
    FROM agent_runs
    WHERE id = ${params.id} AND user_id = ${admin.sub}
    LIMIT 1
  `;

  if (loadResult.rows.length === 0) {
    return notFound("Run not found");
  }

  const run = loadResult.rows[0];

  if (run.status !== "queued") {
    return err(`Run is in status '${run.status}', expected 'queued'`, 409);
  }

  try {
    // Mark as searching
    await sql`
      UPDATE agent_runs
      SET status = 'searching',
          stage_message = 'Searching for articles...',
          progress_pct = 5,
          updated_at = now()
      WHERE id = ${run.id}
    `;

    // ---- Phase 1: Search ----
    const { candidates, usage: searchUsage } = await searchForArticles(run.thesis, run.scope);

    await sql`
      UPDATE agent_runs
      SET status = 'fetching',
          stage_message = ${`Found ${candidates.length} articles. Fetching contents...`},
          progress_pct = 25,
          articles_found = ${candidates.length},
          input_tokens = ${searchUsage.inputTokens},
          output_tokens = ${searchUsage.outputTokens},
          estimated_cost_usd = ${estimateCost(DEFAULT_MODEL, searchUsage.inputTokens, searchUsage.outputTokens)},
          updated_at = now()
      WHERE id = ${run.id}
    `;

    if (candidates.length === 0) {
      // Nothing to fetch — mark as ready with empty batch
      await sql`
        UPDATE agent_runs
        SET status = 'ready',
            stage_message = 'No articles found.',
            progress_pct = 100,
            batch = ${JSON.stringify({ candidates: [], submissions: [], vaultEntries: [], narrative: "No articles found for this topic." })},
            updated_at = now(),
            completed_at = now()
        WHERE id = ${run.id}
      `;
      return ok({
        runId: run.id,
        status: "ready",
        articlesFound: 0,
        message: "Search returned no articles.",
      });
    }

    // ---- Phase 2: Fetch ----
    const urls = candidates.map((c) => c.url);
    const { articles: fetched, errors: fetchErrors } = await fetchArticles(urls);

    // Merge fetched text back into candidate objects so analyze has
    // both the search context (publication, summary, reasonToCheck)
    // and the body text in one place.
    const fetchedByUrl = new Map(fetched.map((a) => [a.url, a]));
    const enrichedCandidates = candidates.map((c) => {
      const f = fetchedByUrl.get(c.url);
      return f ? { ...c, text: f.text, headline: f.headline || c.headline } : c;
    });

    // Recompute total cost (search only so far)
    const totalCost = estimateCost(DEFAULT_MODEL, searchUsage.inputTokens, searchUsage.outputTokens);

    // Move to 'analyzing' (next holding state)
    await sql`
      UPDATE agent_runs
      SET status = 'analyzing',
          stage_message = ${`Fetched ${fetched.length}/${candidates.length} articles. Awaiting analyze phase.`},
          progress_pct = 50,
          articles_fetched = ${fetched.length},
          batch = ${JSON.stringify({
            candidates: enrichedCandidates,
            submissions: [],
            vaultEntries: [],
            narrative: "",
            errors: fetchErrors,
          })},
          estimated_cost_usd = ${totalCost},
          updated_at = now()
      WHERE id = ${run.id}
    `;

    return ok({
      runId: run.id,
      status: "analyzing",
      articlesFound: candidates.length,
      articlesFetched: fetched.length,
      fetchErrors: fetchErrors.length,
      inputTokens: searchUsage.inputTokens,
      outputTokens: searchUsage.outputTokens,
      estimatedCostUsd: totalCost,
      message: `Search + fetch complete. ${fetched.length}/${candidates.length} articles fetched (${fetchErrors.length} errors). Waiting for analyze phase to come online.`,
    });
  } catch (e) {
    // Mark as failed so the user sees the error in the dashboard
    const errorMessage = e instanceof Error ? e.message : String(e);
    try {
      await sql`
        UPDATE agent_runs
        SET status = 'failed',
            error_message = ${errorMessage},
            stage_message = 'Search phase failed',
            updated_at = now(),
            completed_at = now()
        WHERE id = ${run.id}
      `;
    } catch {}
    return serverError(`/api/agent/process/${params.id}`, e);
  }
}
