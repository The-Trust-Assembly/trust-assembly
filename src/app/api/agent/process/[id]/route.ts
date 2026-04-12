import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden, notFound, err, serverError } from "@/lib/api-utils";
import { searchForArticles } from "@/lib/agent/search";
import { fetchArticles } from "@/lib/agent/fetch";
import { analyzeArticles } from "@/lib/agent/analyze";
import { synthesizeAnalyses } from "@/lib/agent/synthesize";
import { estimateCost, DEFAULT_MODEL } from "@/lib/agent/claude-client";
import type {
  AgentBatch,
  SubmissionForReview,
  VaultEntryForReview,
  TokenUsage,
} from "@/lib/agent/types";

export const dynamic = "force-dynamic";
// Allow this route to run for up to 5 minutes — the full pipeline
// (search → fetch → analyze → synthesize) can take 2-4 min on a small
// batch of 5-10 articles.
export const maxDuration = 300;

// POST /api/agent/process/[id]
// -----------------------------
// Runs the full agent pipeline for a queued run, end-to-end:
//   queued → searching → fetching → analyzing → synthesizing → ready
//
// On success the run is in 'ready' status with a complete batch in
// the JSONB column (submissions + vault entries + narrative). The user
// can then review and approve via the review UI.
//
// On any failure the run is marked 'failed' with the error_message set
// so the dashboard can display it.
//
// Admin-gated. Currently invoked manually for testing; the next slice
// will fire it automatically (fire-and-forget) after POST /api/agent/run.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  const loadResult = await sql`
    SELECT id, user_id, thesis, scope, status
    FROM agent_runs
    WHERE id = ${params.id} AND user_id = ${admin.sub}
    LIMIT 1
  `;
  if (loadResult.rows.length === 0) return notFound("Run not found");

  const run = loadResult.rows[0];
  if (run.status !== "queued") {
    return err(`Run is in status '${run.status}', expected 'queued'`, 409);
  }

  const totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  const accumulateCost = () =>
    estimateCost(DEFAULT_MODEL, totalUsage.inputTokens, totalUsage.outputTokens);

  try {
    // ---- Phase 1: Search ----
    await sql`
      UPDATE agent_runs
      SET status = 'searching', stage_message = 'Searching for articles...',
          progress_pct = 5, updated_at = now()
      WHERE id = ${run.id}
    `;

    const { candidates, usage: searchUsage } = await searchForArticles(run.thesis, run.scope);
    totalUsage.inputTokens += searchUsage.inputTokens;
    totalUsage.outputTokens += searchUsage.outputTokens;

    // Empty short-circuit
    if (candidates.length === 0) {
      const emptyBatch: AgentBatch = {
        topic: run.thesis,
        submissions: [],
        vaultEntries: [],
        narrative: "No articles found for this topic.",
        candidates: [],
        errors: [],
      };
      await sql`
        UPDATE agent_runs
        SET status = 'ready', stage_message = 'No articles found.',
            progress_pct = 100, articles_found = 0,
            batch = ${JSON.stringify(emptyBatch)},
            input_tokens = ${totalUsage.inputTokens},
            output_tokens = ${totalUsage.outputTokens},
            estimated_cost_usd = ${accumulateCost()},
            updated_at = now(), completed_at = now()
        WHERE id = ${run.id}
      `;
      return ok({ runId: run.id, status: "ready", articlesFound: 0 });
    }

    await sql`
      UPDATE agent_runs
      SET status = 'fetching',
          stage_message = ${`Found ${candidates.length} articles. Fetching contents...`},
          progress_pct = 25, articles_found = ${candidates.length},
          input_tokens = ${totalUsage.inputTokens},
          output_tokens = ${totalUsage.outputTokens},
          estimated_cost_usd = ${accumulateCost()},
          updated_at = now()
      WHERE id = ${run.id}
    `;

    // ---- Phase 2: Fetch ----
    const urls = candidates.map((c) => c.url);
    const { articles: fetched, errors: fetchErrors } = await fetchArticles(urls);

    if (fetched.length === 0) {
      // All fetches failed — mark as failed
      const failedBatch: AgentBatch = {
        topic: run.thesis,
        submissions: [],
        vaultEntries: [],
        narrative: "All article fetches failed.",
        candidates,
        errors: fetchErrors,
      };
      await sql`
        UPDATE agent_runs
        SET status = 'failed',
            stage_message = 'All article fetches failed',
            error_message = ${`${fetchErrors.length} fetch errors, no articles retrieved`},
            articles_found = ${candidates.length},
            articles_fetched = 0,
            batch = ${JSON.stringify(failedBatch)},
            input_tokens = ${totalUsage.inputTokens},
            output_tokens = ${totalUsage.outputTokens},
            estimated_cost_usd = ${accumulateCost()},
            updated_at = now(), completed_at = now()
        WHERE id = ${run.id}
      `;
      return ok({ runId: run.id, status: "failed", articlesFound: candidates.length, articlesFetched: 0 });
    }

    await sql`
      UPDATE agent_runs
      SET status = 'analyzing',
          stage_message = ${`Fetched ${fetched.length}/${candidates.length}. Analyzing each article...`},
          progress_pct = 50,
          articles_fetched = ${fetched.length},
          updated_at = now()
      WHERE id = ${run.id}
    `;

    // Need headline + text for the analyze phase. Use the search-side
    // headline if the fetcher didn't extract one.
    const headlineByUrl = new Map(candidates.map((c) => [c.url, c.headline]));
    const articlesForAnalysis = fetched.map((f) => ({
      url: f.url,
      headline: f.headline || headlineByUrl.get(f.url) || "",
      text: f.text,
    }));

    // ---- Phase 3: Analyze ----
    const {
      analyzed,
      errors: analyzeErrors,
      usage: analyzeUsage,
    } = await analyzeArticles(articlesForAnalysis, run.thesis);
    totalUsage.inputTokens += analyzeUsage.inputTokens;
    totalUsage.outputTokens += analyzeUsage.outputTokens;

    await sql`
      UPDATE agent_runs
      SET status = 'synthesizing',
          stage_message = ${`Analyzed ${analyzed.length} articles. Synthesizing findings...`},
          progress_pct = 80,
          articles_analyzed = ${analyzed.length},
          input_tokens = ${totalUsage.inputTokens},
          output_tokens = ${totalUsage.outputTokens},
          estimated_cost_usd = ${accumulateCost()},
          updated_at = now()
      WHERE id = ${run.id}
    `;

    // ---- Phase 4: Synthesize ----
    let refined = analyzed;
    let consolidatedVault: AgentBatch["vaultEntries"] = [];
    let narrative = "";

    if (analyzed.length > 0) {
      const synth = await synthesizeAnalyses(run.thesis, analyzed);
      refined = synth.refined;
      narrative = synth.narrative;
      // Wrap raw vault suggestions into review-ready entries
      consolidatedVault = synth.vaultEntries.map((entry, i) => ({
        id: `vault-${run.id.substring(0, 8)}-${i}`,
        approved: true,
        entry,
      }));
      totalUsage.inputTokens += synth.usage.inputTokens;
      totalUsage.outputTokens += synth.usage.outputTokens;
    }

    // Build final reviewable batch. Default approve everything except
    // 'skip' verdicts; the reviewer can toggle.
    const submissions: SubmissionForReview[] = refined.map((a, i) => ({
      id: `sub-${run.id.substring(0, 8)}-${i}`,
      url: a.url,
      headline: a.headline,
      approved: a.analysis.verdict !== "skip",
      analysis: a.analysis,
    }));

    const allErrors = [
      ...fetchErrors,
      ...analyzeErrors,
    ];

    const finalBatch: AgentBatch = {
      topic: run.thesis,
      submissions,
      vaultEntries: consolidatedVault,
      narrative,
      candidates,
      errors: allErrors,
      skipped: submissions.filter((s) => s.analysis.verdict === "skip").length,
    };

    await sql`
      UPDATE agent_runs
      SET status = 'ready',
          stage_message = ${`Complete. ${submissions.length} submissions, ${consolidatedVault.length} vault entries.`},
          progress_pct = 100,
          batch = ${JSON.stringify(finalBatch)},
          input_tokens = ${totalUsage.inputTokens},
          output_tokens = ${totalUsage.outputTokens},
          estimated_cost_usd = ${accumulateCost()},
          updated_at = now(),
          completed_at = now()
      WHERE id = ${run.id}
    `;

    return ok({
      runId: run.id,
      status: "ready",
      articlesFound: candidates.length,
      articlesFetched: fetched.length,
      articlesAnalyzed: analyzed.length,
      submissions: submissions.length,
      vaultEntries: consolidatedVault.length,
      inputTokens: totalUsage.inputTokens,
      outputTokens: totalUsage.outputTokens,
      estimatedCostUsd: accumulateCost(),
      narrative,
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    try {
      await sql`
        UPDATE agent_runs
        SET status = 'failed',
            error_message = ${errorMessage},
            stage_message = 'Pipeline failed',
            input_tokens = ${totalUsage.inputTokens},
            output_tokens = ${totalUsage.outputTokens},
            estimated_cost_usd = ${accumulateCost()},
            updated_at = now(),
            completed_at = now()
        WHERE id = ${run.id}
      `;
    } catch {}
    return serverError(`/api/agent/process/${params.id}`, e);
  }
}
