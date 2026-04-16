import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden, notFound, err, serverError } from "@/lib/api-utils";
import { searchForArticles, generateKeywordsFromThesis } from "@/lib/agent/search";
import { isGoogleSearchAvailable } from "@/lib/agent/google-search";
import { filterByRelevance } from "@/lib/agent/relevance-filter";
import { fetchArticles } from "@/lib/agent/fetch";
import { analyzeArticles } from "@/lib/agent/analyze";
import { synthesizeAnalyses } from "@/lib/agent/synthesize";
import { estimateCost, DEFAULT_MODEL, HAIKU_MODEL } from "@/lib/agent/claude-client";
import type {
  AgentBatch,
  SubmissionForReview,
  VaultEntryForReview,
  TokenUsage,
} from "@/lib/agent/types";

export const dynamic = "force-dynamic";
// Allow this route to run for up to 5 minutes — the full pipeline
// (keywords → search → filter → fetch → analyze → synthesize) can take
// 2-4 min on a small batch of 5-10 articles.
export const maxDuration = 300;

// POST /api/agent/process/[id]
// -----------------------------
// Runs the full agent pipeline for a queued run, end-to-end.
//
// Stage C pipeline:
//   queued → searching (keywords + discovery) → filtering (Haiku, Google only)
//   → fetching → analyzing → synthesizing → ready
//
// Two search paths:
//   1. Google path (GOOGLE_SEARCH_API_KEY + GOOGLE_CX set):
//      keywords → Google Custom Search → Haiku relevance filter → fetch → analyze → synthesize
//   2. Claude fallback (no Google credentials):
//      keywords folded into prompt → Claude web_search → fetch → analyze → synthesize
//
// Both paths produce identical output shapes (AgentBatch).
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  const loadResult = await sql`
    SELECT id, user_id, thesis, scope, context, status
    FROM agent_runs
    WHERE id = ${params.id} AND user_id = ${admin.sub}
    LIMIT 1
  `;
  if (loadResult.rows.length === 0) return notFound("Run not found");

  const run = loadResult.rows[0];
  if (run.status !== "queued") {
    return err(`Run is in status '${run.status}', expected 'queued'`, 409);
  }

  // Track costs per-model for accurate estimation
  const sonnetUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  const haikuUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

  const totalInputTokens = () => sonnetUsage.inputTokens + haikuUsage.inputTokens;
  const totalOutputTokens = () => sonnetUsage.outputTokens + haikuUsage.outputTokens;
  const totalCost = () =>
    estimateCost(DEFAULT_MODEL, sonnetUsage.inputTokens, sonnetUsage.outputTokens) +
    estimateCost(HAIKU_MODEL, haikuUsage.inputTokens, haikuUsage.outputTokens);

  // Extract keywords from context JSONB (stored by POST /api/agent/run)
  const runContext =
    run.context && typeof run.context === "object" ? run.context : {};
  let keywords: string[] | undefined = Array.isArray(runContext.keywords)
    ? runContext.keywords
    : undefined;

  try {
    // ---- Phase 0: Keyword generation (if not provided by user) ----
    if (!keywords || keywords.length === 0) {
      await sql`
        UPDATE agent_runs
        SET status = 'searching',
            stage_message = 'Generating search keywords...',
            progress_pct = 2, updated_at = now()
        WHERE id = ${run.id}
      `;

      const kwResult = await generateKeywordsFromThesis(run.thesis, runContext);
      keywords = kwResult.keywords;
      sonnetUsage.inputTokens += kwResult.usage.inputTokens;
      sonnetUsage.outputTokens += kwResult.usage.outputTokens;
    }

    // ---- Phase 1: Search (Google or Claude web_search) ----
    await sql`
      UPDATE agent_runs
      SET status = 'searching',
          stage_message = ${`Searching with ${keywords.length} keywords...`},
          progress_pct = 5, updated_at = now()
      WHERE id = ${run.id}
    `;

    const searchResult = await searchForArticles(run.thesis, run.scope, undefined, keywords);
    sonnetUsage.inputTokens += searchResult.usage.inputTokens;
    sonnetUsage.outputTokens += searchResult.usage.outputTokens;

    let candidates = searchResult.candidates;

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
            input_tokens = ${totalInputTokens()},
            output_tokens = ${totalOutputTokens()},
            estimated_cost_usd = ${totalCost()},
            updated_at = now(), completed_at = now()
        WHERE id = ${run.id}
      `;
      return ok({ runId: run.id, status: "ready", articlesFound: 0 });
    }

    // ---- Phase 1.5: Haiku relevance filter (Google path only) ----
    // When Claude web_search is used, it already applies relevance
    // judgment during discovery, so filtering is redundant.
    if (searchResult.method === "google" && candidates.length > 0) {
      await sql`
        UPDATE agent_runs
        SET status = 'filtering',
            stage_message = ${`Filtering ${candidates.length} results for relevance...`},
            progress_pct = 20, articles_found = ${candidates.length},
            input_tokens = ${totalInputTokens()},
            output_tokens = ${totalOutputTokens()},
            estimated_cost_usd = ${totalCost()},
            updated_at = now()
        WHERE id = ${run.id}
      `;

      const filterResult = await filterByRelevance(candidates, run.thesis);
      haikuUsage.inputTokens += filterResult.usage.inputTokens;
      haikuUsage.outputTokens += filterResult.usage.outputTokens;
      candidates = filterResult.filtered;

      // All filtered out?
      if (candidates.length === 0) {
        const emptyBatch: AgentBatch = {
          topic: run.thesis,
          submissions: [],
          vaultEntries: [],
          narrative: "Search results found but none were relevant enough to the thesis.",
          candidates: searchResult.candidates,
          errors: [],
        };
        await sql`
          UPDATE agent_runs
          SET status = 'ready',
              stage_message = 'No relevant articles found after filtering.',
              progress_pct = 100, articles_found = ${searchResult.candidates.length},
              batch = ${JSON.stringify(emptyBatch)},
              input_tokens = ${totalInputTokens()},
              output_tokens = ${totalOutputTokens()},
              estimated_cost_usd = ${totalCost()},
              updated_at = now(), completed_at = now()
          WHERE id = ${run.id}
        `;
        return ok({ runId: run.id, status: "ready", articlesFound: searchResult.candidates.length, articlesFiltered: 0 });
      }
    }

    await sql`
      UPDATE agent_runs
      SET status = 'fetching',
          stage_message = ${`Found ${candidates.length} relevant articles. Fetching contents...`},
          progress_pct = 30, articles_found = ${candidates.length},
          input_tokens = ${totalInputTokens()},
          output_tokens = ${totalOutputTokens()},
          estimated_cost_usd = ${totalCost()},
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
            input_tokens = ${totalInputTokens()},
            output_tokens = ${totalOutputTokens()},
            estimated_cost_usd = ${totalCost()},
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
    sonnetUsage.inputTokens += analyzeUsage.inputTokens;
    sonnetUsage.outputTokens += analyzeUsage.outputTokens;

    await sql`
      UPDATE agent_runs
      SET status = 'synthesizing',
          stage_message = ${`Analyzed ${analyzed.length} articles. Synthesizing findings...`},
          progress_pct = 85,
          articles_analyzed = ${analyzed.length},
          input_tokens = ${totalInputTokens()},
          output_tokens = ${totalOutputTokens()},
          estimated_cost_usd = ${totalCost()},
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
      sonnetUsage.inputTokens += synth.usage.inputTokens;
      sonnetUsage.outputTokens += synth.usage.outputTokens;
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
          input_tokens = ${totalInputTokens()},
          output_tokens = ${totalOutputTokens()},
          estimated_cost_usd = ${totalCost()},
          updated_at = now(),
          completed_at = now()
      WHERE id = ${run.id}
    `;

    return ok({
      runId: run.id,
      status: "ready",
      searchMethod: searchResult.method,
      articlesFound: candidates.length,
      articlesFetched: fetched.length,
      articlesAnalyzed: analyzed.length,
      submissions: submissions.length,
      vaultEntries: consolidatedVault.length,
      inputTokens: totalInputTokens(),
      outputTokens: totalOutputTokens(),
      estimatedCostUsd: totalCost(),
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
            input_tokens = ${totalInputTokens()},
            output_tokens = ${totalOutputTokens()},
            estimated_cost_usd = ${totalCost()},
            updated_at = now(),
            completed_at = now()
        WHERE id = ${run.id}
      `;
    } catch {}
    return serverError(`/api/agent/process/${params.id}`, e);
  }
}
