import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden, notFound, err, serverError } from "@/lib/api-utils";
import { searchForArticles } from "@/lib/agent/search";
import { estimateCost, DEFAULT_MODEL } from "@/lib/agent/claude-client";

export const dynamic = "force-dynamic";
// Allow this route to run for up to 5 minutes — search loops up to 10
// rounds and each round can take 20-30s with web_search tool use.
export const maxDuration = 300;

// POST /api/agent/process/[id]
// -----------------------------
// Manually advances a queued agent run through the search phase.
// Currently only the search phase is wired up — fetch/analyze/synthesize
// will follow in subsequent slices. After this completes the run will be
// in 'searching' status with `articles_found` populated and the batch
// JSONB containing the article candidates.
//
// This is admin-gated and currently invoked manually for testing. The
// final slice will fire it automatically (fire-and-forget) after a POST
// /api/agent/run.
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

    // Run the search phase
    const { candidates, usage } = await searchForArticles(run.thesis, run.scope);

    const cost = estimateCost(DEFAULT_MODEL, usage.inputTokens, usage.outputTokens);

    // Persist results — store candidates in batch JSONB so the next
    // phase (fetch) can read them. Status moves to 'fetching' which is
    // a holding state until the fetch service comes online.
    await sql`
      UPDATE agent_runs
      SET status = 'fetching',
          stage_message = ${`Found ${candidates.length} articles. Awaiting fetch phase.`},
          progress_pct = 25,
          articles_found = ${candidates.length},
          batch = ${JSON.stringify({ candidates, submissions: [], vaultEntries: [], narrative: "" })},
          input_tokens = ${usage.inputTokens},
          output_tokens = ${usage.outputTokens},
          estimated_cost_usd = ${cost},
          updated_at = now()
      WHERE id = ${run.id}
    `;

    return ok({
      runId: run.id,
      status: "fetching",
      articlesFound: candidates.length,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      estimatedCostUsd: cost,
      message: `Search complete. Found ${candidates.length} candidate articles. Waiting for fetch phase to come online.`,
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
