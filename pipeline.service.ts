import { searchForArticles, analyzeArticle, synthesizeAnalyses, ANALYSIS_DELAY_MS, ArticleCandidate, ArticleAnalysis, VaultSuggestion, SynthesizedResult } from './claude.service';
import { fetchArticle } from './article-fetcher';
import { submitCorrection, SubmissionResult } from './submission.service';
import { createVaultEntry, VaultResult } from './vault.service';
import { resetCurrentRun, getCurrentRunTokens, recordRunUsage, cleanupRun } from './budget.service';
import log from 'electron-log';
import { BrowserWindow } from 'electron';
import Store from 'electron-store';

// --- Shared interfaces ---
export interface ReviewableSubmission {
  url: string;
  headline: string;
  analysis: ArticleAnalysis;
  approved: boolean;
}

export interface ReviewableVaultEntry {
  id: string;
  entry: VaultSuggestion;
  approved: boolean;
}

export interface SynthesizedBatch {
  runId: string;
  accountId: string;
  topic: string;
  scope: string;
  narrative: string;
  submissions: ReviewableSubmission[];
  vaultEntries: ReviewableVaultEntry[];
  articlesFound: number;
  articlesFetched: number;
  articlesAnalyzed: number;
  skipped: number;
  errors: Array<{ url: string; error: string }>;
}

export interface RunResult {
  runId: string;
  accountId: string;
  timestamp: string;
  topic: string;
  scope: string;
  narrative: string;
  articlesFound: number;
  articlesFetched: number;
  articlesAnalyzed: number;
  submissions: SubmissionResult[];
  vaultResults: VaultResult[];
  skipped: number;
  errors: Array<{ url: string; error: string }>;
}

export interface PipelineProgress {
  runId: string;
  accountId: string;
  stage: 'searching' | 'fetching' | 'analyzing' | 'synthesizing' | 'submitting' | 'complete' | 'error';
  message: string;
  articlesFound: number;
  articlesFetched: number;
  articlesAnalyzed: number;
  correctionsSubmitted: number;
  affirmationsSubmitted: number;
  vaultEntriesCreated: number;
  errors: number;
  total: number;
}

// --- Persistent storage for pending ---
interface PendingSubmission {
  url: string;
  headline: string;
  analysis: ArticleAnalysis;
  runId: string;
  accountId: string;
  topic: string;
  timestamp: string;
}

const pendingStore: any = new Store({
  name: 'trust-assembly-pending',
  defaults: { pending: [] as PendingSubmission[] },
});

function savePending(item: PendingSubmission): void {
  const list: PendingSubmission[] = pendingStore.get('pending') || [];
  list.push(item);
  pendingStore.set('pending', list);
}

function removePending(url: string, runId: string): void {
  const list: PendingSubmission[] = pendingStore.get('pending') || [];
  pendingStore.set('pending', list.filter(
    (p: PendingSubmission) => !(p.url === url && p.runId === runId)
  ));
}

export function getPendingSubmissions(): PendingSubmission[] {
  return pendingStore.get('pending') || [];
}

export function clearAllPending(): void {
  pendingStore.set('pending', []);
}

// --- Helpers ---
export function generateRunId(): string {
  return `run-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

function sendProgress(win: BrowserWindow | null, progress: PipelineProgress): void {
  if (win && !win.isDestroyed()) {
    win.webContents.send('pipeline:progress', progress);
  }
}

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('Run cancelled');
}

function prog(
  runId: string, accountId: string,
  stage: PipelineProgress['stage'], message: string,
  s: { found: number; fetched: number; analyzed: number; subs: SubmissionResult[]; vault: VaultResult[]; errs: number }
): PipelineProgress {
  return {
    runId, accountId, stage, message,
    articlesFound: s.found, articlesFetched: s.fetched, articlesAnalyzed: s.analyzed,
    correctionsSubmitted: s.subs.filter(x => x.success && x.type === 'correction').length,
    affirmationsSubmitted: s.subs.filter(x => x.success && x.type === 'affirmation').length,
    vaultEntriesCreated: s.vault.filter(x => x.success).length,
    errors: s.errs, total: s.found,
  };
}

// ============================================================
// PHASE 1: RUN — Search, Fetch, Analyze, Synthesize → Review
// ============================================================
export async function runPipeline(
  topic: string,
  scope: string,
  accountId: string,
  runId: string,
  win: BrowserWindow | null,
  abortSignal?: AbortSignal,
): Promise<SynthesizedBatch> {
  const errors: Array<{ url: string; error: string }> = [];
  let articlesFound = 0;
  let articlesFetched = 0;
  let articlesAnalyzed = 0;
  let skipped = 0;
  const s = () => ({ found: articlesFound, fetched: articlesFetched, analyzed: articlesAnalyzed, subs: [] as SubmissionResult[], vault: [] as VaultResult[], errs: errors.length });

  log.info(`Pipeline Phase 1 (run ${runId}, account ${accountId}): "${topic}" (scope: ${scope})`);
  resetCurrentRun(runId);

  try {
    // SEARCH
    checkAbort(abortSignal);
    sendProgress(win, prog(runId, accountId, 'searching', 'Searching for articles...', s()));
    const candidates = await searchForArticles(topic, scope, accountId, runId, (msg) => {
      sendProgress(win, prog(runId, accountId, 'searching', msg, s()));
    }, abortSignal);
    articlesFound = candidates.length;

    if (candidates.length === 0) {
      return {
        runId, accountId, topic, scope, narrative: '', articlesFound: 0, articlesFetched: 0,
        articlesAnalyzed: 0, skipped: 0, errors: [], submissions: [], vaultEntries: [],
      };
    }

    log.info(`Found ${articlesFound} candidate articles`);

    // FETCH + ANALYZE
    const completedAnalyses: Array<{ url: string; headline: string; analysis: ArticleAnalysis }> = [];

    for (let i = 0; i < candidates.length; i++) {
      checkAbort(abortSignal);
      const candidate = candidates[i];

      sendProgress(win, prog(runId, accountId, 'fetching', `Fetching (${i + 1}/${articlesFound}): ${candidate.headline}`, s()));
      const fetched = await fetchArticle(candidate.url);
      articlesFetched++;

      if (!fetched.success) {
        errors.push({ url: candidate.url, error: fetched.error || 'Fetch failed' });
        continue;
      }

      checkAbort(abortSignal);
      sendProgress(win, prog(runId, accountId, 'analyzing', `Analyzing (${i + 1}/${articlesFound}): ${candidate.headline}`, s()));

      try {
        const analysis = await analyzeArticle(candidate.url, fetched.title || candidate.headline, fetched.content, topic, accountId, runId, abortSignal);
        articlesAnalyzed++;

        if (analysis.verdict === 'skip' || analysis.confidence === 'low') {
          skipped++;
          log.info(`Skipped ${candidate.url}: verdict=${analysis.verdict}, confidence=${analysis.confidence}`);
        } else {
          completedAnalyses.push({ url: candidate.url, headline: fetched.title || candidate.headline, analysis });
        }
      } catch (e: any) {
        if (e.message === 'Run cancelled') throw e;
        articlesAnalyzed++;
        errors.push({ url: candidate.url, error: e.message || 'Analysis failed' });
        log.error(`Analysis failed for ${candidate.url}:`, e);
      }

      if (i < candidates.length - 1) {
        log.info(`Waiting ${ANALYSIS_DELAY_MS / 1000}s before next analysis...`);
        await new Promise(resolve => setTimeout(resolve, ANALYSIS_DELAY_MS));
      }
    }

    if (completedAnalyses.length === 0) {
      return {
        runId, accountId, topic, scope, narrative: '', articlesFound, articlesFetched,
        articlesAnalyzed, skipped, errors, submissions: [], vaultEntries: [],
      };
    }

    // SYNTHESIZE
    checkAbort(abortSignal);
    sendProgress(win, prog(runId, accountId, 'synthesizing', `Synthesizing ${completedAnalyses.length} analyses...`, s()));

    let synthesized: SynthesizedResult;
    try {
      await new Promise(resolve => setTimeout(resolve, ANALYSIS_DELAY_MS));
      synthesized = await synthesizeAnalyses(topic, completedAnalyses, accountId, runId, abortSignal);
      log.info(`Synthesis complete: ${synthesized.vaultEntries.length} vault entries, narrative: ${synthesized.narrative.substring(0, 100)}`);
    } catch (e: any) {
      if (e.message === 'Run cancelled') throw e;
      log.error('Synthesis failed, using raw analyses:', e);
      synthesized = {
        analyses: completedAnalyses.map(a => a.analysis),
        vaultEntries: completedAnalyses.flatMap(a => a.analysis.vaultEntries || []),
        narrative: '',
      };
    }

    // Record token usage
    const finalTokens = getCurrentRunTokens(runId);
    recordRunUsage(runId, finalTokens.input, finalTokens.output, accountId);

    // Build reviewable batch
    const submissions: ReviewableSubmission[] = completedAnalyses.map((ca, i) => ({
      url: ca.url,
      headline: ca.headline,
      analysis: synthesized.analyses[i] || ca.analysis,
      approved: true,
    }));

    const vaultEntries: ReviewableVaultEntry[] = synthesized.vaultEntries.map((ve, i) => ({
      id: `vault-${runId}-${i}`,
      entry: ve,
      approved: true,
    }));

    sendProgress(win, prog(runId, accountId, 'complete',
      `Ready for review: ${submissions.length} submissions, ${vaultEntries.length} vault entries.`, s()));

    return {
      runId, accountId, topic, scope,
      narrative: synthesized.narrative,
      submissions, vaultEntries,
      articlesFound, articlesFetched, articlesAnalyzed, skipped, errors,
    };
  } finally {
    cleanupRun(runId);
  }
}

// ============================================================
// PHASE 2: SUBMIT APPROVED — Takes user-reviewed batch, submits
// ============================================================
export async function submitApprovedBatch(
  batch: SynthesizedBatch,
  orgIds: string[],
  accountId: string,
  win: BrowserWindow | null
): Promise<RunResult> {
  const runId = batch.runId;
  const submissions: SubmissionResult[] = [];
  const vaultResults: VaultResult[] = [];
  const errors: Array<{ url: string; error: string }> = [];

  const approvedSubs = batch.submissions.filter(s => s.approved && s.analysis.verdict !== 'skip');
  const approvedVault = batch.vaultEntries.filter(v => v.approved);

  log.info(`Pipeline Phase 2 (run ${runId}, account ${accountId}): submitting ${approvedSubs.length} submissions, ${approvedVault.length} vault entries to ${orgIds.length} assemblies`);

  const s = () => ({
    found: batch.articlesFound, fetched: batch.articlesFetched, analyzed: batch.articlesAnalyzed,
    subs: submissions, vault: vaultResults, errs: errors.length,
  });

  sendProgress(win, prog(runId, accountId, 'submitting', `Submitting ${approvedSubs.length} approved items...`, s()));

  // Submit corrections/affirmations
  for (let i = 0; i < approvedSubs.length; i++) {
    const { url, headline, analysis } = approvedSubs[i];

    savePending({ url, headline, analysis, runId, accountId, topic: batch.topic, timestamp: new Date().toISOString() });

    sendProgress(win, prog(runId, accountId, 'submitting',
      `Submitting ${analysis.verdict} (${i + 1}/${approvedSubs.length}): ${headline}`, s()));

    const result = await submitCorrection(url, analysis, orgIds, accountId);
    submissions.push(result);

    if (result.success) {
      removePending(url, runId);
      log.info(`Submitted: ${url} (${analysis.verdict})`);
    } else {
      errors.push({ url, error: result.error || 'Submission failed' });
    }

    if (i < approvedSubs.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Submit vault entries
  const seenKeys = new Set<string>();
  for (const ve of approvedVault) {
    const key = ve.entry.assertion || ve.entry.content || ve.entry.original || '';
    if (!key || seenKeys.has(key)) continue;
    seenKeys.add(key);

    const vr = await createVaultEntry(ve.entry, orgIds, accountId);
    vaultResults.push(vr);
    if (vr.success) {
      log.info(`Vault entry created (${ve.entry.type}): ${vr.entryId}`);
    } else {
      log.warn(`Vault entry failed: ${vr.error}`);
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  const sc = submissions.filter(x => x.success && x.type === 'correction').length;
  const sa = submissions.filter(x => x.success && x.type === 'affirmation').length;
  const sv = vaultResults.filter(x => x.success).length;
  const pending = getPendingSubmissions().filter(p => p.runId === runId).length;

  const msg = [
    `Submitted!`, sc > 0 ? `${sc} corrections` : null, sa > 0 ? `${sa} affirmations` : null,
    sv > 0 ? `${sv} vault entries` : null, pending > 0 ? `${pending} pending retry` : null,
  ].filter(Boolean).join(', ') + '.';

  sendProgress(win, prog(runId, accountId, 'complete', msg, s()));

  return {
    runId, accountId, timestamp: new Date().toISOString(),
    topic: batch.topic, scope: batch.scope, narrative: batch.narrative,
    articlesFound: batch.articlesFound, articlesFetched: batch.articlesFetched,
    articlesAnalyzed: batch.articlesAnalyzed,
    submissions, vaultResults, skipped: batch.skipped, errors,
  };
}

// ============================================================
// RETRY: re-submit persisted pending analyses
// ============================================================
export async function retrySubmissions(
  orgId: string,
  accountId: string,
  win: BrowserWindow | null
): Promise<RunResult> {
  const pending = getPendingSubmissions();
  if (pending.length === 0) throw new Error('No pending submissions to retry.');

  const runId = generateRunId();
  const submissions: SubmissionResult[] = [];
  const errors: Array<{ url: string; error: string }> = [];
  const s = () => ({
    found: pending.length, fetched: pending.length, analyzed: pending.length,
    subs: submissions, vault: [] as VaultResult[], errs: errors.length,
  });

  sendProgress(win, prog(runId, accountId, 'submitting', `Retrying ${pending.length} pending...`, s()));

  for (let i = 0; i < pending.length; i++) {
    const item = pending[i];
    sendProgress(win, prog(runId, accountId, 'submitting',
      `Submitting (${i + 1}/${pending.length}): ${item.headline}`, s()));

    const result = await submitCorrection(item.url, item.analysis, [orgId], item.accountId || accountId);
    submissions.push(result);

    if (result.success) {
      removePending(item.url, item.runId);
    } else {
      errors.push({ url: item.url, error: result.error || 'Submission failed' });
    }
    if (i < pending.length - 1) await new Promise(r => setTimeout(r, 500));
  }

  sendProgress(win, prog(runId, accountId, 'complete', `Retry complete!`, s()));

  return {
    runId, accountId, timestamp: new Date().toISOString(),
    topic: `[Retry] ${pending.length} pending`, scope: 'retry', narrative: '',
    articlesFound: pending.length, articlesFetched: pending.length, articlesAnalyzed: pending.length,
    submissions, vaultResults: [], skipped: 0, errors,
  };
}
