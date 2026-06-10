import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { ok, forbidden, notFound, err, serverError } from "@/lib/api-utils";
import { generateKeywordsFromThesis, searchForArticles } from "@/lib/agent/search";
import { fetchArticles } from "@/lib/agent/fetch";
import { analyzeArticle } from "@/lib/agent/analyze";
import { verifyQuotes } from "@/lib/agent/verify-quotes";
import { verifyEvidenceUrls } from "@/lib/agent/verify-urls";
import { synthesizeAnalyses } from "@/lib/agent/synthesize";
import { verifyVaultEntries } from "@/lib/agent/verify-vault";
import { verifyTranslationDropIns } from "@/lib/agent/verify-translations";
import { estimateCost, DEFAULT_MODEL, HAIKU_MODEL } from "@/lib/agent/claude-client";
import { saveArtifact, getArtifacts, countArtifacts } from "@/lib/agent/artifacts";
import { logStepTokens } from "@/lib/agent/llm-logger";
import { getPromptVersions } from "@/lib/agent/prompts";
import type { AgentBatch, ArticleCandidate, SubmissionForReview, TokenUsage } from "@/lib/agent/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/agent/step/[id]
// ----------------------------
// Step-based pipeline runner. Does ONE small piece of work per call,
// saves results to the DB, then calls itself to continue. Each step
// is short (~30-60s) so it never hits the Vercel timeout.
//
// Steps are determined by the run's current status:
//   queued     → generate keywords + search → status=searched
//   searched   → fetch all articles → status=fetched
//   fetched    → analyze ONE un-analyzed article → stays fetched (or → analyzed)
//   analyzed   → verify quotes + URLs → status=verified
//   verified   → synthesize + vault verify → status=ready
//
// Verified handoff: after each step, the function calls itself with
// retry logic. If the call fails 3 times, it logs the error and the
// run stays in its current status for manual retry.

// No server-side self-calling — Vercel detects recursive function
// calls as infinite loops (508 INFINITE_LOOP_DETECTED). Instead,
// each step returns { needsNextStep: true } and the client fires
// the next step via polling.
function needsNextStep(): { success: true; needsNextStep: true } {
  return { success: true, needsNextStep: true };
}

async function logHandoffFailure(runId: string, step: string, error: string) {
  try {
    await sql`
      UPDATE agent_runs
      SET status = 'failed',
          stage_message = ${`HANDOFF FAILED at ${step}: ${error}`},
          error_message = ${`Step handoff failed: ${step} → ${error}`},
          updated_at = now(),
          completed_at = now()
      WHERE id = ${runId}
    `;
  } catch {}
}

async function updateRun(
  runId: string,
  status: string,
  message: string,
  pct: number,
  extra?: Record<string, number>
) {
  await sql`
    UPDATE agent_runs
    SET status = ${status},
        stage_message = ${message},
        progress_pct = ${pct},
        updated_at = now()
    WHERE id = ${runId}
  `;
  if (extra) {
    if (extra.articles_found != null) await sql`UPDATE agent_runs SET articles_found = ${extra.articles_found} WHERE id = ${runId}`;
    if (extra.articles_fetched != null) await sql`UPDATE agent_runs SET articles_fetched = ${extra.articles_fetched} WHERE id = ${runId}`;
    if (extra.articles_analyzed != null) await sql`UPDATE agent_runs SET articles_analyzed = ${extra.articles_analyzed} WHERE id = ${runId}`;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireSession(request);
  if (!session) return forbidden("Login required");

  const loadResult = await sql`
    SELECT id, user_id, thesis, scope, context, status, batch,
           input_tokens, output_tokens, estimated_cost_usd
    FROM agent_runs
    WHERE id = ${params.id} AND user_id = ${session.sub}
    LIMIT 1
  `;
  if (loadResult.rows.length === 0) return notFound("Run not found");

  const run = loadResult.rows[0];
  const runContext = run.context && typeof run.context === "object" ? run.context : {};
  const assemblyContext = runContext.orgName
    ? { name: runContext.orgName as string, description: (runContext.orgDescription as string) || "" }
    : undefined;

  // Cost guard: kill the run if it's consumed too much —
  // prevents runaway costs from infinite loops
  const MAX_COST_PER_RUN = 10.0;
  const MAX_TOKENS_PER_RUN = 2_000_000;
  const currentCost = Number(run.estimated_cost_usd || 0);
  const currentTokens = (run.input_tokens || 0) + (run.output_tokens || 0);

  if (currentCost >= MAX_COST_PER_RUN || currentTokens >= MAX_TOKENS_PER_RUN) {
    await sql`
      UPDATE agent_runs
      SET status = 'failed',
          error_message = ${`Run killed: cost $${currentCost.toFixed(2)} exceeded $${MAX_COST_PER_RUN} limit (${currentTokens.toLocaleString()} tokens)`},
          stage_message = 'Cost limit exceeded',
          updated_at = now(), completed_at = now()
      WHERE id = ${run.id}
    `;
    return ok({ runId: run.id, status: "failed", reason: "cost_limit", cost: currentCost, tokens: currentTokens });
  }

  // Terminal states — nothing to do
  if (["ready", "completed", "failed", "cancelled"].includes(run.status)) {
    return ok({ runId: run.id, status: run.status, step: "none", message: "Run is in terminal state" });
  }

  try {
    // ========== PHANTOM FEED: skip search, go straight to fetched ==========
    if (run.status === "queued" && run.scope === "phantom-feed") {
      const postUrls: string[] = Array.isArray(runContext.postUrls) ? runContext.postUrls : [];
      if (postUrls.length === 0) {
        await sql`
          UPDATE agent_runs SET status = 'failed', error_message = 'No post URLs in context',
              stage_message = 'Phantom scan failed — no URLs', updated_at = now(), completed_at = now()
          WHERE id = ${run.id}
        `;
        return ok({ runId: run.id, status: "failed", step: "phantom-no-urls" });
      }

      // Save post URLs as candidates, then immediately fetch (no client roundtrip needed)
      for (const url of postUrls) {
        await saveArtifact(run.id, "search", "candidate", { url, headline: "", publication: "", summary: "Phantom feed post", reasonToCheck: "" }, url);
      }

      await updateRun(run.id, "fetching", `Fetching ${postUrls.length} posts...`, 25);

      const { articles: fetched, errors: fetchErrors } = await fetchArticles(postUrls);

      for (const f of fetched) {
        await saveArtifact(run.id, "fetch", "fetched_text", {
          headline: f.headline, textLength: f.text.length, text: f.text,
        }, f.url);
      }

      if (fetched.length === 0) {
        await sql`
          UPDATE agent_runs SET status = 'failed', stage_message = 'All post fetches failed.',
              error_message = ${`${fetchErrors.length} fetch errors`},
              articles_found = ${postUrls.length}, articles_fetched = 0,
              updated_at = now(), completed_at = now()
          WHERE id = ${run.id}
        `;
        return ok({ runId: run.id, status: "failed", step: "phantom-fetch-failed" });
      }

      await sql`
        UPDATE agent_runs SET status = 'fetched',
            stage_message = ${`Fetched ${fetched.length}/${postUrls.length}. Analyzing...`},
            progress_pct = 30, articles_found = ${postUrls.length},
            articles_fetched = ${fetched.length}, updated_at = now()
        WHERE id = ${run.id}
      `;

      return ok({ runId: run.id, status: "fetched", step: "phantom-fetched", needsNextStep: true, articlesFetched: fetched.length });
    }

    // ========== STEP: QUEUED → SEARCHED ==========
    if (run.status === "queued") {
      // Log prompt versions used for this run
      const promptVersions = getPromptVersions();
      if (Object.keys(promptVersions).length > 0) {
        await saveArtifact(run.id, "meta", "prompt_versions", promptVersions);
      }

      // Generate keywords if not provided
      let keywords: string[] = Array.isArray(runContext.keywords) ? runContext.keywords : [];
      let inputTokens = 0;
      let outputTokens = 0;

      if (keywords.length === 0) {
        await updateRun(run.id, "queued", "Generating search keywords...", 2);
        const kwResult = await generateKeywordsFromThesis(run.thesis, runContext);
        keywords = kwResult.keywords;
        inputTokens += kwResult.usage.inputTokens;
        outputTokens += kwResult.usage.outputTokens;
      }

      // Search
      await updateRun(run.id, "searching", `Searching with ${keywords.length} keywords...`, 5);

      const searchResult = await searchForArticles(
        run.thesis, run.scope,
        async (msg) => { await updateRun(run.id, "searching", msg, 10); },
        keywords
      );
      inputTokens += searchResult.usage.inputTokens;
      outputTokens += searchResult.usage.outputTokens;

      // Save candidates as artifacts
      for (const c of searchResult.candidates) {
        await saveArtifact(run.id, "search", "candidate", c, c.url);
      }

      const cost = estimateCost(DEFAULT_MODEL, inputTokens, outputTokens);

      if (searchResult.candidates.length === 0) {
        const emptyBatch: AgentBatch = {
          topic: run.thesis, submissions: [], vaultEntries: [],
          narrative: "No articles found for this topic.", candidates: [], errors: [],
        };
        await sql`
          UPDATE agent_runs
          SET status = 'ready', stage_message = 'No articles found.', progress_pct = 100,
              articles_found = 0, batch = ${JSON.stringify(emptyBatch)},
              input_tokens = ${inputTokens}, output_tokens = ${outputTokens},
              estimated_cost_usd = ${cost}, updated_at = now(), completed_at = now()
          WHERE id = ${run.id}
        `;
        return ok({ runId: run.id, status: "ready", step: "search", articlesFound: 0 });
      }

      await sql`
        UPDATE agent_runs
        SET status = 'searched', stage_message = ${`Found ${searchResult.candidates.length} articles. Fetching...`},
            progress_pct = 20, articles_found = ${searchResult.candidates.length},
            input_tokens = ${inputTokens}, output_tokens = ${outputTokens},
            estimated_cost_usd = ${cost}, updated_at = now()
        WHERE id = ${run.id}
      `;

      
      // Client fires next step
      await logStepTokens(run.id, "search", inputTokens, outputTokens, cost);
      return ok({ runId: run.id, status: "searched", step: "search", articlesFound: searchResult.candidates.length, needsNextStep: true });
    }

    // ========== STEP: SEARCHED → FETCHED ==========
    if (run.status === "searched") {
      const candidateArtifacts = await getArtifacts(run.id, "candidate");
      const urls = candidateArtifacts.map((a) => (a.data as ArticleCandidate).url).filter(Boolean);

      // Add user-specified URLs
      const specificUrls: string[] = Array.isArray(runContext.specificUrls) ? runContext.specificUrls : [];
      const allUrls = [...new Set([...urls, ...specificUrls])];

      await updateRun(run.id, "fetching", `Fetching ${allUrls.length} articles...`, 25);

      const { articles: fetched, errors: fetchErrors } = await fetchArticles(allUrls);

      // Save fetched articles as artifacts
      for (const f of fetched) {
        await saveArtifact(run.id, "fetch", "fetched_text", {
          headline: f.headline, textLength: f.text.length, text: f.text,
        }, f.url);
      }

      if (fetched.length === 0) {
        await sql`
          UPDATE agent_runs
          SET status = 'failed', stage_message = 'All article fetches failed.',
              error_message = ${`${fetchErrors.length} fetch errors`},
              articles_fetched = 0, updated_at = now(), completed_at = now()
          WHERE id = ${run.id}
        `;
        return ok({ runId: run.id, status: "failed", step: "fetch" });
      }

      await sql`
        UPDATE agent_runs
        SET status = 'fetched', stage_message = ${`Fetched ${fetched.length}/${allUrls.length}. Analyzing...`},
            progress_pct = 30, articles_fetched = ${fetched.length}, updated_at = now()
        WHERE id = ${run.id}
      `;

      
      // Client fires next step
      return ok({ runId: run.id, status: "fetched", step: "fetch", articlesFetched: fetched.length, needsNextStep: true });
    }

    // ========== STEP: FETCHED → ANALYZE ONE ARTICLE ==========
    if (run.status === "fetched") {
      // Find articles that haven't been analyzed yet
      const fetchedArtifacts = await getArtifacts(run.id, "fetched_text");
      const analyzedCount = await countArtifacts(run.id, "analysis");
      const totalToAnalyze = Math.min(fetchedArtifacts.length, 12); // cap

      if (analyzedCount >= totalToAnalyze) {
        // All done — move to analyzed
        await updateRun(run.id, "analyzed", `Analyzed ${analyzedCount} articles. Verifying...`, 80, {
          articles_analyzed: analyzedCount,
        });
        
        // Client fires next step
        return ok({ runId: run.id, status: "analyzed", step: "analyze-complete", needsNextStep: true });
      }

      // Analyze the next un-analyzed article
      const analyzedUrls = new Set(
        (await getArtifacts(run.id, "analysis")).map((a) => a.article_url)
      );
      const nextArticle = fetchedArtifacts.find((a) => !analyzedUrls.has(a.article_url));

      if (!nextArticle) {
        await updateRun(run.id, "analyzed", `Analyzed ${analyzedCount} articles. Verifying...`, 80);
        
        // Client fires next step
        return ok({ runId: run.id, status: "analyzed", step: "analyze-complete", needsNextStep: true });
      }

      const articleData = nextArticle.data as { headline?: string; text?: string };
      const articleNum = analyzedCount + 1;
      const pct = 30 + Math.round((articleNum / totalToAnalyze) * 50);

      await updateRun(run.id, "fetched", `Analyzing article ${articleNum} of ${totalToAnalyze}...`, pct);

      const { analysis, usage } = await analyzeArticle(
        nextArticle.article_url || "",
        articleData.headline || "",
        articleData.text || "",
        run.thesis,
        assemblyContext,
        run.id
      );

      // Verify quotes for this article
      if (analysis.evidence && articleData.text) {
        verifyQuotes(analysis, articleData.text);
      }

      // Save analysis as artifact
      await saveArtifact(run.id, "analyze", "analysis", {
        url: nextArticle.article_url,
        headline: articleData.headline,
        analysis,
      }, nextArticle.article_url || undefined);

      // Log per-article tokens
      const articleCost = estimateCost(DEFAULT_MODEL, usage.inputTokens, usage.outputTokens);
      await logStepTokens(run.id, `analyze-${articleNum}`, usage.inputTokens, usage.outputTokens, articleCost);

      // Update token counts
      await sql`
        UPDATE agent_runs
        SET input_tokens = input_tokens + ${usage.inputTokens},
            output_tokens = output_tokens + ${usage.outputTokens},
            estimated_cost_usd = estimated_cost_usd + ${articleCost},
            articles_analyzed = ${articleNum},
            stage_message = ${`Analyzed ${articleNum} of ${totalToAnalyze}...`},
            progress_pct = ${pct},
            updated_at = now()
        WHERE id = ${run.id}
      `;

      // Fire next step (which will be another analyze or move to verified)
      
      // Client fires next step
      return ok({ runId: run.id, status: "fetched", step: `analyze-${articleNum}`, needsNextStep: true });
    }

    // ========== STEP: ANALYZED → VERIFIED ==========
    // Cheap transition. URL verification used to run here, but the
    // verified analyses were never persisted — the next step reloaded
    // artifacts and the work was lost. Verification now runs in the
    // VERIFIED→READY step, on the same in-memory analyses that flow
    // into synthesis and the final batch.
    if (run.status === "analyzed") {
      await sql`
        UPDATE agent_runs
        SET status = 'verified', stage_message = 'Verifying & synthesizing...', progress_pct = 85, updated_at = now()
        WHERE id = ${run.id}
      `;

      // Client fires next step
      return ok({ runId: run.id, status: "verified", step: "verify", needsNextStep: true });
    }

    // ========== STEP: VERIFIED → READY ==========
    if (run.status === "verified") {
      await updateRun(run.id, "synthesizing", "Synthesizing findings...", 88);

      // Load analyses
      const analysisArtifacts = await getArtifacts(run.id, "analysis");
      const analyzed = analysisArtifacts.map((a) => {
        const d = a.data as { url: string; headline: string; analysis: import("@/lib/agent/types").ArticleAnalysis };
        return { url: d.url, headline: d.headline, analysis: d.analysis };
      });

      // Verify evidence URLs on the same in-memory analyses that feed
      // synthesis — the stamps survive the merge into the final batch.
      await updateRun(run.id, "synthesizing", "Verifying evidence URLs...", 86);
      await verifyEvidenceUrls(analyzed);

      // Synthesize
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

        await sql`
          UPDATE agent_runs
          SET input_tokens = input_tokens + ${synth.usage.inputTokens},
              output_tokens = output_tokens + ${synth.usage.outputTokens},
              estimated_cost_usd = estimated_cost_usd + ${estimateCost(DEFAULT_MODEL, synth.usage.inputTokens, synth.usage.outputTokens)},
              updated_at = now()
          WHERE id = ${run.id}
        `;
      }

      // Vault verification
      if (consolidatedVault.length > 0) {
        await updateRun(run.id, "synthesizing", `Verifying ${consolidatedVault.length} vault entries...`, 92);
        const vaultResult = await verifyVaultEntries(consolidatedVault);
        await sql`
          UPDATE agent_runs
          SET input_tokens = input_tokens + ${vaultResult.usage.inputTokens},
              output_tokens = output_tokens + ${vaultResult.usage.outputTokens},
              updated_at = now()
          WHERE id = ${run.id}
        `;
      }

      // Translation drop-in verification
      const translationEntries = consolidatedVault.filter((v) => v.entry.type === "translation" && v.entry.testSentences?.length);
      if (translationEntries.length > 0) {
        const dropInResult = await verifyTranslationDropIns(consolidatedVault);
        await sql`
          UPDATE agent_runs
          SET input_tokens = input_tokens + ${dropInResult.usage.inputTokens},
              output_tokens = output_tokens + ${dropInResult.usage.outputTokens},
              updated_at = now()
          WHERE id = ${run.id}
        `;
      }

      // Build final batch
      const candidateArtifacts = await getArtifacts(run.id, "candidate");
      const candidates = candidateArtifacts.map((a) => a.data as ArticleCandidate);

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
        candidates,
        errors: [],
        skipped: submissions.filter((s) => s.analysis.verdict === "skip").length,
      };

      await sql`
        UPDATE agent_runs
        SET status = 'ready',
            stage_message = ${`Complete. ${submissions.length} submissions, ${consolidatedVault.length} vault entries.`},
            progress_pct = 100,
            batch = ${JSON.stringify(finalBatch)},
            updated_at = now(),
            completed_at = now()
        WHERE id = ${run.id}
      `;

      return ok({ runId: run.id, status: "ready", step: "synthesize", submissions: submissions.length, vault: consolidatedVault.length });
    }

    // Unknown status — try to continue from searching
    if (run.status === "searching" || run.status === "fetching" || run.status === "verifying" || run.status === "synthesizing") {
      // These are intermediate statuses from the old pipeline. Reset to nearest step status.
      await sql`UPDATE agent_runs SET status = 'queued', updated_at = now() WHERE id = ${run.id}`;
      
      // Client fires next step
      return ok({ runId: run.id, status: "queued", step: "reset", message: "Reset from intermediate status" });
    }

    return ok({ runId: run.id, status: run.status, step: "unknown", message: `Unhandled status: ${run.status}` });

  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    try {
      await sql`
        UPDATE agent_runs
        SET status = 'failed', error_message = ${`Step failed: ${errorMessage}`},
            stage_message = ${`Step failed: ${errorMessage.substring(0, 100)}`},
            updated_at = now(), completed_at = now()
        WHERE id = ${run.id}
      `;
    } catch {}
    return serverError(`/api/agent/step/${params.id}`, e);
  }
}
