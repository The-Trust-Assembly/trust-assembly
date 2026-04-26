import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden, notFound, err, serverError } from "@/lib/api-utils";
import { searchForArticles, generateKeywordsFromThesis } from "@/lib/agent/search";
import { isGoogleSearchAvailable } from "@/lib/agent/google-search";
import { filterByRelevance } from "@/lib/agent/relevance-filter";
import { fetchArticles } from "@/lib/agent/fetch";
import { analyzeArticles } from "@/lib/agent/analyze";
import { verifyQuotes } from "@/lib/agent/verify-quotes";
import { verifyEvidenceUrls } from "@/lib/agent/verify-urls";
import { verifyVaultEntries } from "@/lib/agent/verify-vault";
import { synthesizeAnalyses } from "@/lib/agent/synthesize";
import { estimateCost, DEFAULT_MODEL, HAIKU_MODEL } from "@/lib/agent/claude-client";
import type {
  AgentBatch,
  ArticleCandidate,
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
    SELECT id, user_id, thesis, scope, context, status, batch
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

  // Extract context JSONB
  const runContext =
    run.context && typeof run.context === "object" ? run.context : {};

  // ---- PHANTOM FEED PATH ----
  // When scope is 'phantom-feed', the run was created by POST /api/agent/feed/[id].
  // Post URLs are pre-selected by the user — skip search/filter entirely and
  // go directly to fetch → analyze → synthesize.
  if (run.scope === "phantom-feed") {
    const postUrls: string[] = Array.isArray(runContext.postUrls) ? runContext.postUrls : [];
    if (postUrls.length === 0) {
      await sql`
        UPDATE agent_runs
        SET status = 'failed', error_message = 'No post URLs in context',
            stage_message = 'Phantom scan failed — no URLs', updated_at = now(), completed_at = now()
        WHERE id = ${run.id}
      `;
      return err("No post URLs in run context", 400);
    }

    try {
      // Phase 1: Fetch
      await sql`
        UPDATE agent_runs
        SET status = 'fetching',
            stage_message = ${`Fetching ${postUrls.length} posts...`},
            progress_pct = 15, articles_found = ${postUrls.length}, updated_at = now()
        WHERE id = ${run.id}
      `;

      const { articles: fetched, errors: fetchErrors } = await fetchArticles(postUrls);

      if (fetched.length === 0) {
        const failedBatch: AgentBatch = {
          topic: run.thesis,
          submissions: [],
          vaultEntries: [],
          narrative: "All post fetches failed.",
          errors: fetchErrors,
        };
        await sql`
          UPDATE agent_runs
          SET status = 'failed', stage_message = 'All post fetches failed',
              error_message = ${`${fetchErrors.length} fetch errors`},
              articles_found = ${postUrls.length}, articles_fetched = 0,
              batch = ${JSON.stringify(failedBatch)},
              updated_at = now(), completed_at = now()
          WHERE id = ${run.id}
        `;
        return ok({ runId: run.id, status: "failed" });
      }

      await sql`
        UPDATE agent_runs
        SET status = 'analyzing',
            stage_message = ${`Fetched ${fetched.length}/${postUrls.length}. Analyzing...`},
            progress_pct = 40, articles_fetched = ${fetched.length}, updated_at = now()
        WHERE id = ${run.id}
      `;

      // Phase 2: Analyze
      let articlesForAnalysis = fetched.map((f) => ({
        url: f.url,
        headline: f.headline || "",
        text: f.text,
      }));

      if (articlesForAnalysis.length > 5) {
        articlesForAnalysis = articlesForAnalysis.slice(0, 5);
      }

      const { analyzed, errors: analyzeErrors, usage: analyzeUsage } =
        await analyzeArticles(articlesForAnalysis, run.thesis, async (i, total) => {
          const pct = 40 + Math.round((i / total) * 35);
          await sql`
            UPDATE agent_runs
            SET stage_message = ${`Analyzing post ${i} of ${total}...`},
                progress_pct = ${pct}, articles_analyzed = ${i}, updated_at = now()
            WHERE id = ${run.id}
          `;
        });
      sonnetUsage.inputTokens += analyzeUsage.inputTokens;
      sonnetUsage.outputTokens += analyzeUsage.outputTokens;

      // Quote + URL verification for Phantom posts
      const phantomTextByUrl = new Map(articlesForAnalysis.map((a) => [a.url, a.text]));
      for (const a of analyzed) {
        const text = phantomTextByUrl.get(a.url);
        if (text && a.analysis.evidence) verifyQuotes(a.analysis, text);
      }
      await verifyEvidenceUrls(analyzed);

      await sql`
        UPDATE agent_runs
        SET status = 'synthesizing',
            stage_message = ${`Analyzed ${analyzed.length} posts. Synthesizing...`},
            progress_pct = 80, articles_analyzed = ${analyzed.length},
            input_tokens = ${totalInputTokens()}, output_tokens = ${totalOutputTokens()},
            estimated_cost_usd = ${totalCost()}, updated_at = now()
        WHERE id = ${run.id}
      `;

      // Phase 3: Synthesize
      let refined = analyzed;
      let consolidatedVault: AgentBatch["vaultEntries"] = [];
      let narrative = "";

      if (analyzed.length > 0) {
        const synth = await synthesizeAnalyses(run.thesis, analyzed);
        refined = synth.refined;
        narrative = synth.narrative;
        consolidatedVault = synth.vaultEntries.map((entry, i) => ({
          id: `vault-${run.id.substring(0, 8)}-${i}`,
          approved: true,
          entry,
        }));
        sonnetUsage.inputTokens += synth.usage.inputTokens;
        sonnetUsage.outputTokens += synth.usage.outputTokens;
      }

      const submissions: SubmissionForReview[] = refined.map((a, i) => ({
        id: `sub-${run.id.substring(0, 8)}-${i}`,
        url: a.url,
        headline: a.headline,
        approved: a.analysis.verdict !== "skip" && a.analysis.confidence !== "low",
        analysis: a.analysis,
      }));

      const finalBatch: AgentBatch = {
        topic: run.thesis,
        submissions,
        vaultEntries: consolidatedVault,
        narrative,
        errors: [...fetchErrors, ...analyzeErrors],
        skipped: submissions.filter((s) => s.analysis.verdict === "skip").length,
      };

      await sql`
        UPDATE agent_runs
        SET status = 'ready',
            stage_message = ${`Complete. ${submissions.length} submissions, ${consolidatedVault.length} vault entries.`},
            progress_pct = 100, batch = ${JSON.stringify(finalBatch)},
            input_tokens = ${totalInputTokens()}, output_tokens = ${totalOutputTokens()},
            estimated_cost_usd = ${totalCost()}, updated_at = now(), completed_at = now()
        WHERE id = ${run.id}
      `;

      return ok({
        runId: run.id,
        status: "ready",
        searchMethod: "phantom-feed",
        articlesFetched: fetched.length,
        articlesAnalyzed: analyzed.length,
        submissions: submissions.length,
        estimatedCostUsd: totalCost(),
      });
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      try {
        await sql`
          UPDATE agent_runs
          SET status = 'failed', error_message = ${errorMessage},
              stage_message = 'Phantom pipeline failed',
              input_tokens = ${totalInputTokens()}, output_tokens = ${totalOutputTokens()},
              estimated_cost_usd = ${totalCost()}, updated_at = now(), completed_at = now()
          WHERE id = ${run.id}
        `;
      } catch {}
      return serverError(`/api/agent/process/${params.id} (phantom)`, e);
    }
  }

  // ---- SENTINEL PATH (default) ----
  // Check for a checkpoint from a previous attempt (retry scenario).
  // If resuming, we skip completed phases and use saved data.
  const existingBatch = run.batch && typeof run.batch === "object" ? run.batch : {};
  const checkpoint: string | null = existingBatch._checkpoint || null;
  let resumedCandidates: ArticleCandidate[] | null = null;
  let resumedFetched: Array<{ url: string; headline: string; text: string }> | null = null;

  if (checkpoint === "fetch" || checkpoint === "analyze") {
    // We have fetched articles — skip search and fetch entirely
    resumedCandidates = existingBatch.candidates || [];
    resumedFetched = existingBatch.fetched || [];
    await sql`
      UPDATE agent_runs
      SET status = 'analyzing',
          stage_message = ${`Resuming from ${checkpoint} checkpoint...`},
          progress_pct = 50, updated_at = now()
      WHERE id = ${run.id}
    `;
  } else if (checkpoint === "search" || checkpoint === "filter") {
    // We have search results — skip search but still need to fetch
    resumedCandidates = existingBatch.candidates || [];
    await sql`
      UPDATE agent_runs
      SET status = 'fetching',
          stage_message = ${`Resuming from ${checkpoint} checkpoint — fetching ${resumedCandidates!.length} articles...`},
          progress_pct = 30, updated_at = now()
      WHERE id = ${run.id}
    `;
  }

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

    // ---- Phase 1: Search ----
    // Skip if resuming from a checkpoint that already has candidates
    let candidates: ArticleCandidate[];
    let searchMethod: string = "claude-web-search";

    if (resumedCandidates) {
      candidates = resumedCandidates;
    } else {
      await sql`
        UPDATE agent_runs
        SET status = 'searching',
            stage_message = ${`Searching with ${keywords!.length} keywords...`},
            progress_pct = 5, updated_at = now()
        WHERE id = ${run.id}
      `;

      const searchResult = await searchForArticles(run.thesis, run.scope, undefined, keywords);
      sonnetUsage.inputTokens += searchResult.usage.inputTokens;
      sonnetUsage.outputTokens += searchResult.usage.outputTokens;
      candidates = searchResult.candidates;
      searchMethod = searchResult.method;

      // Checkpoint: save search results
      await sql`
        UPDATE agent_runs
        SET batch = ${JSON.stringify({ _checkpoint: "search", candidates, searchMethod })},
            updated_at = now()
        WHERE id = ${run.id}
      `;
    }

    // Add user-specified URLs to the candidate list
    const specificUrls: string[] = Array.isArray(runContext.specificUrls) ? runContext.specificUrls : [];
    if (specificUrls.length > 0) {
      const existingUrls = new Set(candidates.map((c) => c.url));
      for (const url of specificUrls) {
        if (!existingUrls.has(url)) {
          candidates.push({
            url,
            headline: "",
            publication: "",
            summary: "User-specified URL",
            reasonToCheck: "Included manually by user",
          });
        }
      }
    }

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
    if (searchMethod === "google" && candidates.length > 0 && !resumedCandidates) {
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
          candidates,
          errors: [],
        };
        await sql`
          UPDATE agent_runs
          SET status = 'ready',
              stage_message = 'No relevant articles found after filtering.',
              progress_pct = 100, articles_found = ${candidates.length},
              batch = ${JSON.stringify(emptyBatch)},
              input_tokens = ${totalInputTokens()},
              output_tokens = ${totalOutputTokens()},
              estimated_cost_usd = ${totalCost()},
              updated_at = now(), completed_at = now()
          WHERE id = ${run.id}
        `;
        return ok({ runId: run.id, status: "ready", articlesFound: candidates.length, articlesFiltered: 0 });
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
    // Skip if resuming from fetch/analyze checkpoint
    let articlesForAnalysis: Array<{ url: string; headline: string; text: string }>;
    let fetchErrors: Array<{ url: string; error: string }> = [];

    if (resumedFetched && resumedFetched.length > 0) {
      articlesForAnalysis = resumedFetched;
    } else {
      const urls = candidates.map((c) => c.url);
      const fetchResult = await fetchArticles(urls);
      const fetched = fetchResult.articles;
      fetchErrors = fetchResult.errors;

      if (fetched.length === 0) {
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

      const headlineByUrl = new Map(candidates.map((c) => [c.url, c.headline]));
      articlesForAnalysis = fetched.map((f) => ({
        url: f.url,
        headline: f.headline || headlineByUrl.get(f.url) || "",
        text: f.text,
      }));

      // Checkpoint: save fetched articles so analyze can resume from here
      await sql`
        UPDATE agent_runs
        SET status = 'analyzing',
            stage_message = ${`Fetched ${fetched.length}/${candidates.length}. Analyzing each article...`},
            progress_pct = 50,
            articles_fetched = ${fetched.length},
            batch = ${JSON.stringify({
              _checkpoint: "fetch",
              candidates,
              fetched: articlesForAnalysis,
              fetchErrors,
            })},
            updated_at = now()
        WHERE id = ${run.id}
      `;
    }

    // Cap articles to avoid Vercel function timeout (maxDuration=300s).
    // Scale analysis cap with scope tier. Higher tiers allow more
    // articles but cost more credits.
    const SCOPE_ARTICLE_LIMITS: Record<string, number> = {
      quick: 3, single: 3,
      standard: 5, top3: 5, top10: 5,
      deep: 8, pages5: 8,
      comprehensive: 12, max: 12,
    };
    const MAX_ARTICLES = SCOPE_ARTICLE_LIMITS[run.scope] || 5;
    if (articlesForAnalysis.length > MAX_ARTICLES) {
      articlesForAnalysis = articlesForAnalysis.slice(0, MAX_ARTICLES);
      await sql`
        UPDATE agent_runs
        SET stage_message = ${`Analyzing top ${MAX_ARTICLES} of ${articlesForAnalysis.length} articles (capped to stay within time limit)...`},
            updated_at = now()
        WHERE id = ${run.id}
      `;
    }

    // ---- Phase 3: Analyze ----
    // onProgress fires AFTER each article with the accumulated results.
    // Saves a checkpoint so retry can skip already-analyzed articles.
    const {
      analyzed,
      errors: analyzeErrors,
      usage: analyzeUsage,
    } = await analyzeArticles(articlesForAnalysis, run.thesis, async (i, total, analyzedSoFar) => {
      const pct = 50 + Math.round((i / total) * 30); // 50% → 80%
      await sql`
        UPDATE agent_runs
        SET stage_message = ${`Analyzing article ${i} of ${total}...`},
            progress_pct = ${pct},
            articles_analyzed = ${i},
            batch = ${JSON.stringify({
              _checkpoint: "analyze",
              candidates,
              fetched: articlesForAnalysis,
              analyzed: analyzedSoFar,
              fetchErrors,
            })},
            updated_at = now()
        WHERE id = ${run.id}
      `;
    });
    sonnetUsage.inputTokens += analyzeUsage.inputTokens;
    sonnetUsage.outputTokens += analyzeUsage.outputTokens;

    // ---- Phase 3.5: Quote + URL verification ----
    // Deterministically verify quotes and URLs. No LLM cost.
    const articleTextByUrl = new Map(
      articlesForAnalysis.map((a) => [a.url, a.text])
    );
    let totalQuotesVerified = 0;
    let totalQuotesNotFound = 0;
    for (const a of analyzed) {
      const text = articleTextByUrl.get(a.url);
      if (text && a.analysis.evidence) {
        const result = verifyQuotes(a.analysis, text);
        totalQuotesVerified += result.verified + result.approximate;
        totalQuotesNotFound += result.notFound;
      }
    }

    // Verify all external URLs cited in evidence
    const urlResult = await verifyEvidenceUrls(analyzed);

    const verifyMsg = [
      `${totalQuotesVerified} quotes verified`,
      totalQuotesNotFound > 0 ? `${totalQuotesNotFound} quotes not found` : "",
      urlResult.notFound > 0 ? `${urlResult.notFound} URLs broken` : "",
    ].filter(Boolean).join(", ");

    await sql`
      UPDATE agent_runs
      SET status = 'synthesizing',
          stage_message = ${`Analyzed ${analyzed.length} articles (${verifyMsg}). Synthesizing...`},
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

    // ---- Phase 4.5: Vault entry verification ----
    // For each standing correction, run a targeted web search to verify
    // the assertion is factually accurate. Disputed entries are auto-unapproved.
    if (consolidatedVault.length > 0) {
      await sql`
        UPDATE agent_runs
        SET stage_message = ${`Verifying ${consolidatedVault.length} vault entries...`},
            progress_pct = 92, updated_at = now()
        WHERE id = ${run.id}
      `;

      const vaultVerify = await verifyVaultEntries(consolidatedVault);
      sonnetUsage.inputTokens += vaultVerify.usage.inputTokens;
      sonnetUsage.outputTokens += vaultVerify.usage.outputTokens;

      await sql`
        UPDATE agent_runs
        SET stage_message = ${`Vault: ${vaultVerify.verified} verified, ${vaultVerify.disputed} disputed, ${vaultVerify.unverified} unverified.`},
            progress_pct = 95, updated_at = now()
        WHERE id = ${run.id}
      `;
    }

    // Build final reviewable batch.
    // Auto-approve: skip verdicts excluded, low-confidence auto-unapproved.
    const submissions: SubmissionForReview[] = refined.map((a, i) => ({
      id: `sub-${run.id.substring(0, 8)}-${i}`,
      url: a.url,
      headline: a.headline,
      approved: a.analysis.verdict !== "skip" && a.analysis.confidence !== "low",
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
      searchMethod,
      articlesFound: candidates.length,
      articlesFetched: articlesForAnalysis.length,
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
