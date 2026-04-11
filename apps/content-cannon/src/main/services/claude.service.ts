import Anthropic from '@anthropic-ai/sdk';
import { loadCredentials, getDefaultAccountId } from './credentials.service';
import { addTokens, checkBudget, getModelName } from './budget.service';
import { retryWithBackoff, sleep } from '../utils/retry';
import log from 'electron-log';

// --- Client pool keyed by accountId ---
const clients = new Map<string, Anthropic>();

function resolveAccount(accountId?: string): string {
  return accountId || getDefaultAccountId() || '';
}

function getClient(accountId?: string): Anthropic {
  const id = resolveAccount(accountId);
  let client = clients.get(id);
  if (!client) {
    const creds = loadCredentials(id);
    if (!creds?.claudeApiKey) {
      throw new Error(`Claude API key not configured for account ${id}`);
    }
    client = new Anthropic({ apiKey: creds.claudeApiKey });
    clients.set(id, client);
  }
  return client;
}

export function resetClient(accountId?: string): void {
  if (accountId) {
    clients.delete(accountId);
  } else {
    clients.clear();
  }
}

// --- Interfaces ---

export interface ArticleCandidate {
  url: string;
  headline: string;
  publication: string;
  summary: string;
  reasonToCheck: string;
}

export interface VaultSuggestion {
  type: 'vault' | 'argument' | 'translation';
  assertion?: string;
  evidence?: string;
  content?: string;
  original?: string;
  translated?: string;
  translationType?: 'clarity' | 'propaganda' | 'euphemism' | 'satirical';
}

export interface InlineEdit {
  originalText: string;
  correctedText: string;
  explanation: string;
}

export interface ArticleAnalysis {
  verdict: 'correction' | 'affirmation' | 'skip';
  originalHeadline: string;
  replacement?: string;
  reasoning: string;
  evidence: Array<{ description: string; url?: string }>;
  confidence: 'high' | 'medium' | 'low';
  bodyAnalysis?: string;
  inlineEdits?: InlineEdit[];
  vaultEntries?: VaultSuggestion[];
}

export interface SynthesizedResult {
  analyses: ArticleAnalysis[];
  vaultEntries: VaultSuggestion[];
  narrative: string;
}

// --- JSON extraction ---

function extractJSON(text: string): string {
  let str = text.trim();

  try { JSON.parse(str); return str; } catch {}

  if (str.includes('```')) {
    const codeBlockMatch = str.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeBlockMatch) {
      try { JSON.parse(codeBlockMatch[1].trim()); return codeBlockMatch[1].trim(); } catch {}
    }
  }

  const objStart = str.indexOf('{');
  if (objStart >= 0) {
    const lastBrace = str.lastIndexOf('}');
    if (lastBrace > objStart) {
      const candidate = str.substring(objStart, lastBrace + 1);
      try { JSON.parse(candidate); return candidate; } catch {}
    }
  }

  const arrStart = str.indexOf('[');
  if (arrStart >= 0) {
    const lastBracket = str.lastIndexOf(']');
    if (lastBracket > arrStart) {
      const candidate = str.substring(arrStart, lastBracket + 1);
      try { JSON.parse(candidate); return candidate; } catch {}
    }
  }

  return str;
}

// --- Abort check helper ---

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('Run cancelled');
}

// --- API functions ---

export async function searchForArticles(
  topic: string,
  scope: string,
  accountId?: string,
  runId?: string,
  onProgress?: (msg: string) => void,
  abortSignal?: AbortSignal,
): Promise<ArticleCandidate[]> {
  const claude = getClient(accountId);
  const allCandidates: ArticleCandidate[] = [];
  const seenUrls = new Set<string>();
  let round = 1;

  while (true) {
    checkAbort(abortSignal);
    onProgress?.(`Search round ${round}...`);
    log.info(`Search round ${round} for topic: ${topic}`);

    const previousUrls = allCandidates.map(c => c.url).join('\n');
    const previousContext = allCandidates.length > 0
      ? `\n\nYou have already found these articles (do NOT return duplicates):\n${previousUrls}`
      : '';

    const budgetCheck = checkBudget(runId);
    if (!budgetCheck.allowed) {
      log.warn(`Budget limit reached in search round ${round}: ${budgetCheck.reason}`);
      onProgress?.(`Budget limit reached: ${budgetCheck.reason}`);
      break;
    }

    const response = await retryWithBackoff(
      () => claude.messages.create({
        model: getModelName(),
        max_tokens: 4096,
        tools: [{
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 10,
        }],
        messages: [{
          role: 'user',
          content: `You are a research assistant for Trust Assembly, a civic fact-checking platform.

Your task: Find articles related to this topic that may warrant fact-checking (corrections or affirmations).

Topic: ${topic}
Search scope: ${scope}
Current search round: ${round}
Articles found so far: ${allCandidates.length}
${previousContext}

Search the web and return a JSON array of articles. For each article include:
- url: the article URL
- headline: the article's headline
- publication: the publication name
- summary: brief summary of the main claims
- reasonToCheck: why this article might warrant fact-checking

IMPORTANT: Return ONLY a valid JSON array. Do not include any text before or after the JSON. Example format:
[{"url": "...", "headline": "...", "publication": "...", "summary": "...", "reasonToCheck": "..."}]

If you cannot find any more relevant articles, return an empty array: []`
        }],
      }),
      `Search round ${round}`,
    );

    if (response.usage) {
      addTokens(runId || '', response.usage.input_tokens, response.usage.output_tokens);
      log.info(`Search round ${round} tokens: ${response.usage.input_tokens} in / ${response.usage.output_tokens} out`);
    }

    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      log.warn(`No text in search response round ${round}`);
      break;
    }

    try {
      const jsonStr = extractJSON(textBlock.text);
      const candidates: ArticleCandidate[] = JSON.parse(jsonStr);

      if (!Array.isArray(candidates) || candidates.length === 0) {
        log.info(`No more articles found in round ${round}`);
        break;
      }

      let newCount = 0;
      for (const candidate of candidates) {
        if (candidate.url && !seenUrls.has(candidate.url)) {
          seenUrls.add(candidate.url);
          allCandidates.push(candidate);
          newCount++;
        }
      }

      log.info(`Round ${round}: found ${candidates.length} articles, ${newCount} new`);
      onProgress?.(`Found ${allCandidates.length} articles so far...`);

      if (newCount === 0) {
        log.info('No new articles found, stopping search');
        break;
      }

      round++;
      if (round > 10) {
        log.info('Hit max search rounds (10), stopping');
        break;
      }
    } catch (e) {
      log.error(`Failed to parse search results in round ${round}:`, e);
      log.error(`Raw response text: ${textBlock.text.substring(0, 500)}`);
      break;
    }
  }

  log.info(`Search complete: ${allCandidates.length} total articles found`);
  return allCandidates;
}

const ANALYSIS_DELAY_MS = 15000;

export async function analyzeArticle(
  url: string,
  headline: string,
  articleText: string,
  topic: string,
  accountId?: string,
  runId?: string,
  abortSignal?: AbortSignal,
): Promise<ArticleAnalysis> {
  checkAbort(abortSignal);
  const claude = getClient(accountId);

  const maxChars = 30000;
  const truncatedText = articleText.length > maxChars
    ? articleText.substring(0, maxChars) + '\n\n[Article truncated for analysis]'
    : articleText;

  const budgetCheck = checkBudget(runId);
  if (!budgetCheck.allowed) {
    throw new Error(`Budget limit reached: ${budgetCheck.reason}`);
  }

  const response = await retryWithBackoff(
    () => claude.messages.create({
      model: getModelName(),
      max_tokens: 2048,
      tools: [{
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 5,
      }],
      messages: [{
        role: 'user',
        content: `You are a fact-checker for Trust Assembly, a civic deliberation platform.

Analyze the following article for factual accuracy in the context of this topic: "${topic}"

Article URL: ${url}
Article Headline: ${headline}

Article Text:
${truncatedText}

Your analysis should:
1. Identify specific factual claims in the article
2. Use web search to verify key claims against reliable sources
3. Determine if the headline is misleading, accurate, or needs correction
4. Provide evidence with source URLs for your findings

IMPORTANT: Respond with ONLY a valid JSON object. Do not include any text before or after the JSON.

In addition to your verdict, identify any reusable knowledge that could apply across multiple articles on this topic. These become "vault entries" in Trust Assembly:

- **Standing Corrections** (type: "vault"): Reusable factual statements with evidence that correct a common misconception. Example: "William Newland was not convicted of any crime" with court record evidence. These are facts that many articles may get wrong.
- **Arguments** (type: "argument"): Logical frameworks that help evaluate claims on this topic. Example: "Protected speech under the First Amendment does not imply the speech's claims are factually true."
- **Translations** (type: "translation"): Cases where the article uses propaganda, euphemisms, or jargon that obscures meaning. Include the original phrase and a clearer replacement. translationType can be "clarity", "propaganda", "euphemism", or "satirical".

JSON format:
{
  "verdict": "correction",
  "originalHeadline": "the article's original headline",
  "replacement": "corrected headline (only if verdict is correction, omit for affirmation/skip)",
  "reasoning": "detailed explanation with specific claims cited. Max 2000 characters.",
  "evidence": [{"description": "what this evidence shows", "url": "source URL"}],
  "confidence": "high",
  "bodyAnalysis": "optional detailed analysis",
  "inlineEdits": [
    {"originalText": "exact quote from article that is wrong", "correctedText": "what it should say", "explanation": "why this is wrong"}
  ],
  "vaultEntries": [
    {"type": "vault", "assertion": "reusable factual claim", "evidence": "supporting evidence with sources"},
    {"type": "argument", "content": "logical framework or rhetorical tool"},
    {"type": "translation", "original": "jargon or propaganda phrase", "translated": "clear plain language", "translationType": "propaganda"}
  ]
}

Rules:
- verdict must be exactly "correction", "affirmation", or "skip"
- Use "skip" for paywalled, opinion/editorial, or unfalsifiable content
- Use "correction" ONLY when you can cite specific factual errors with evidence
- Use "affirmation" when the article is factually sound on an important topic
- vaultEntries is optional — only include entries that would genuinely be reusable across multiple articles
- Standing corrections should be facts, not opinions — things that can be verified`
      }],
    }),
    `Analysis of ${url}`,
  );

  if (response.usage) {
    addTokens(runId || '', response.usage.input_tokens, response.usage.output_tokens);
    log.info(`Analysis tokens: ${response.usage.input_tokens} in / ${response.usage.output_tokens} out`);
  }

  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text in analysis response');
  }

  const jsonStr = extractJSON(textBlock.text);

  try {
    return JSON.parse(jsonStr) as ArticleAnalysis;
  } catch (e) {
    log.error(`Failed to parse analysis JSON for ${url}. Raw text: ${textBlock.text.substring(0, 500)}`);
    return {
      verdict: 'skip',
      originalHeadline: headline,
      reasoning: 'Analysis produced non-parseable output',
      evidence: [],
      confidence: 'low',
    };
  }
}

export async function synthesizeAnalyses(
  topic: string,
  analyses: Array<{ url: string; headline: string; analysis: ArticleAnalysis }>,
  accountId?: string,
  runId?: string,
  abortSignal?: AbortSignal,
): Promise<SynthesizedResult> {
  checkAbort(abortSignal);
  const claude = getClient(accountId);

  const budgetCheck = checkBudget(runId);
  if (!budgetCheck.allowed) {
    throw new Error(`Budget limit reached: ${budgetCheck.reason}`);
  }

  const analysisSummaries = analyses.map((a, i) => {
    const ae = a.analysis;
    return `--- Article ${i + 1} ---
URL: ${a.url}
Headline: ${a.headline}
Verdict: ${ae.verdict} (confidence: ${ae.confidence})
Replacement headline: ${ae.replacement || 'N/A'}
Reasoning: ${ae.reasoning}
Evidence: ${JSON.stringify(ae.evidence)}
Inline edits: ${JSON.stringify(ae.inlineEdits || [])}
Vault entries: ${JSON.stringify(ae.vaultEntries || [])}`;
  }).join('\n\n');

  log.info(`Running synthesis across ${analyses.length} articles`);

  const response = await retryWithBackoff(
    () => claude.messages.create({
      model: getModelName(),
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `You are a senior fact-checker for Trust Assembly, a civic deliberation platform. You have just reviewed ${analyses.length} articles on this topic:

"${topic}"

Here are the individual analyses produced by a junior fact-checker:

${analysisSummaries}

Your job is to SYNTHESIZE these into a coordinated, complete picture. This is critical because:
1. Later articles may reveal information that changes the verdict on earlier articles
2. Vault entries (standing corrections, arguments, translations) should reflect the COMPLETE understanding, not just one article's view
3. Inline edits should be consistent across articles — the same factual error in different articles should be corrected the same way
4. The goal is to tell the COMPLETE STORY of this topic across all sources

Respond with ONLY a valid JSON object:
{
  "analyses": [
    {
      "url": "article URL (must match an input URL)",
      "verdict": "correction | affirmation | skip",
      "originalHeadline": "original headline",
      "replacement": "corrected headline if correction",
      "reasoning": "refined reasoning incorporating cross-article understanding. Max 2000 chars.",
      "evidence": [{"description": "...", "url": "..."}],
      "confidence": "high | medium | low",
      "inlineEdits": [
        {"originalText": "exact wrong text", "correctedText": "corrected text", "explanation": "why"}
      ]
    }
  ],
  "vaultEntries": [
    {"type": "vault", "assertion": "consolidated factual claim verified across sources", "evidence": "all supporting evidence with sources"},
    {"type": "argument", "content": "logical framework applicable to this entire topic"},
    {"type": "translation", "original": "recurring propaganda/euphemism phrase", "translated": "plain language", "translationType": "propaganda | clarity | euphemism | satirical"}
  ],
  "narrative": "A 2-3 sentence summary of the complete story this set of corrections tells. What does the public need to understand about this topic?"
}

Rules:
- Return one entry in analyses[] for each input article, using the same URL
- You may CHANGE a verdict if cross-referencing reveals the original was wrong
- You may UPGRADE confidence if multiple articles corroborate the same fact
- You may DOWNGRADE confidence if articles contradict each other
- Vault entries should be CONSOLIDATED — one standing correction per fact, not one per article
- Translations should be DEDUPLICATED — one entry per phrase even if multiple articles use it
- Inline edits must quote the EXACT text from the article to be replaced
- The narrative should help a human understand WHY these corrections matter together`
      }],
    }),
    'Synthesis',
  );

  if (response.usage) {
    addTokens(runId || '', response.usage.input_tokens, response.usage.output_tokens);
    log.info(`Synthesis tokens: ${response.usage.input_tokens} in / ${response.usage.output_tokens} out`);
  }

  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text in synthesis response');
  }

  const jsonStr = extractJSON(textBlock.text);

  try {
    const result = JSON.parse(jsonStr) as SynthesizedResult;

    const refined: ArticleAnalysis[] = [];
    for (const orig of analyses) {
      const synthEntry = result.analyses?.find((s: any) => s.url === orig.url);
      if (synthEntry) {
        refined.push({
          verdict: synthEntry.verdict || orig.analysis.verdict,
          originalHeadline: synthEntry.originalHeadline || orig.analysis.originalHeadline,
          replacement: synthEntry.replacement || orig.analysis.replacement,
          reasoning: synthEntry.reasoning || orig.analysis.reasoning,
          evidence: synthEntry.evidence || orig.analysis.evidence,
          confidence: synthEntry.confidence || orig.analysis.confidence,
          inlineEdits: synthEntry.inlineEdits || orig.analysis.inlineEdits,
        });
      } else {
        refined.push(orig.analysis);
      }
    }

    return {
      analyses: refined,
      vaultEntries: result.vaultEntries || [],
      narrative: result.narrative || '',
    };
  } catch (e) {
    log.error(`Failed to parse synthesis JSON. Raw: ${textBlock.text.substring(0, 500)}`);
    return {
      analyses: analyses.map(a => a.analysis),
      vaultEntries: analyses.flatMap(a => a.analysis.vaultEntries || []),
      narrative: '',
    };
  }
}

export { ANALYSIS_DELAY_MS };
