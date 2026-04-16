// Trust Assembly Agent — Haiku relevance filter
// ------------------------------------------------
// Takes raw search results (from Google CSE) and the thesis, sends them
// in a single batch to Haiku for relevance scoring, and returns only
// the candidates that pass the threshold.
//
// This step exists because Google keyword search returns broad results —
// many are tangentially related at best. The Haiku call is cheap ($0.80/M
// input, $4/M output) and fast, saving expensive Sonnet analysis time on
// irrelevant articles.
//
// When the Claude web_search fallback is used (no Google credentials),
// this step is skipped entirely — Claude's web_search already applies
// relevance judgment during discovery.

import { getClaudeClient, HAIKU_MODEL } from "./claude-client";
import { extractJSON } from "./json-extract";
import type { ArticleCandidate, TokenUsage } from "./types";

const RELEVANCE_THRESHOLD = 5;
const MAX_BATCH_SIZE = 30;

export interface FilterResult {
  filtered: ArticleCandidate[];
  usage: TokenUsage;
}

// Score a batch of candidates. Returns all candidates with a relevance
// score, but only those >= threshold are included in `filtered`.
async function scoreBatch(
  candidates: ArticleCandidate[],
  thesis: string
): Promise<{ scored: Array<{ url: string; relevance: number; reasoning: string }>; usage: TokenUsage }> {
  const claude = getClaudeClient();

  const candidateList = candidates.map((c, i) => ({
    i,
    url: c.url,
    title: c.headline,
    snippet: c.summary,
  }));

  const prompt = `You are a relevance scorer for Trust Assembly, a civic fact-checking platform.

A user wants to fact-check this thesis:
"${thesis}"

Below are ${candidates.length} search results. Score each one 0–10 for how relevant it is to the thesis. A score of 0 means completely unrelated; 10 means directly discusses the exact claims in the thesis.

Search results:
${JSON.stringify(candidateList, null, 2)}

Return ONLY a JSON array. For each result include:
- "i": the index number from the input
- "relevance": integer 0–10
- "reasoning": one sentence explaining the score (max 80 chars)

Example: [{"i": 0, "relevance": 8, "reasoning": "Directly discusses the court ruling mentioned in the thesis"}]

Score generously — when in doubt, score higher. We'd rather analyze an extra article than miss a relevant one.`;

  try {
    const response = await claude.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const usage: TokenUsage = {
      inputTokens: response.usage?.input_tokens || 0,
      outputTokens: response.usage?.output_tokens || 0,
    };

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return { scored: [], usage };
    }

    const scores = JSON.parse(extractJSON(textBlock.text)) as Array<{
      i: number;
      relevance: number;
      reasoning: string;
    }>;

    if (!Array.isArray(scores)) return { scored: [], usage };

    return {
      scored: scores.map((s) => ({
        url: candidates[s.i]?.url || "",
        relevance: typeof s.relevance === "number" ? s.relevance : 0,
        reasoning: typeof s.reasoning === "string" ? s.reasoning : "",
      })),
      usage,
    };
  } catch (e) {
    console.error("[relevance-filter] Haiku scoring failed:", e);
    return { scored: [], usage: { inputTokens: 0, outputTokens: 0 } };
  }
}

export async function filterByRelevance(
  candidates: ArticleCandidate[],
  thesis: string,
  onProgress?: (msg: string) => void
): Promise<FilterResult> {
  if (candidates.length === 0) {
    return { filtered: [], usage: { inputTokens: 0, outputTokens: 0 } };
  }

  onProgress?.(`Scoring ${candidates.length} results for relevance...`);

  const totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  const allScores = new Map<string, { relevance: number; reasoning: string }>();

  // Split into batches of MAX_BATCH_SIZE to avoid context overflow
  for (let start = 0; start < candidates.length; start += MAX_BATCH_SIZE) {
    const batch = candidates.slice(start, start + MAX_BATCH_SIZE);
    const { scored, usage } = await scoreBatch(batch, thesis);

    totalUsage.inputTokens += usage.inputTokens;
    totalUsage.outputTokens += usage.outputTokens;

    for (const s of scored) {
      if (s.url) {
        allScores.set(s.url, { relevance: s.relevance, reasoning: s.reasoning });
      }
    }
  }

  // Filter by threshold. If Haiku returned no scores (failure), keep all
  // candidates as a graceful fallback.
  let filtered: ArticleCandidate[];
  if (allScores.size === 0) {
    console.warn("[relevance-filter] Haiku returned no scores, proceeding with all candidates");
    filtered = candidates;
  } else {
    filtered = candidates.filter((c) => {
      const score = allScores.get(c.url);
      return score ? score.relevance >= RELEVANCE_THRESHOLD : true; // Keep unscored ones
    });

    // Enrich reasonToCheck from Haiku's reasoning
    for (const c of filtered) {
      const score = allScores.get(c.url);
      if (score?.reasoning) {
        c.reasonToCheck = score.reasoning;
      }
    }
  }

  onProgress?.(`Relevance filter: ${filtered.length}/${candidates.length} passed (threshold ${RELEVANCE_THRESHOLD}/10).`);

  return { filtered, usage: totalUsage };
}
