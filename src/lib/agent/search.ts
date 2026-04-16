// Trust Assembly Agent — search service
// ----------------------------------------
// Discovers articles related to a thesis. Two paths:
//
//   1. Google path (when GOOGLE_SEARCH_API_KEY + GOOGLE_CX are set):
//      Keywords → Google Custom Search → raw candidates
//      The pipeline orchestrator runs Haiku relevance filtering separately.
//
//   2. Claude web_search fallback (no Google credentials):
//      Uses Claude's native web_search tool to discover + filter in one
//      step. This is the original approach from Stage B.
//
// Both paths return SearchResult { candidates, usage } with the same
// ArticleCandidate shape, so the rest of the pipeline is agnostic.

import { getClaudeClient, DEFAULT_MODEL } from "./claude-client";
import { extractJSON } from "./json-extract";
import { isGoogleSearchAvailable, googleSearchMulti } from "./google-search";
import type { ArticleCandidate, TokenUsage } from "./types";

const MAX_ROUNDS = 10;

export interface SearchResult {
  candidates: ArticleCandidate[];
  usage: TokenUsage;
  method: "google" | "claude-web-search";
}

// ---- Public API ----

export async function searchForArticles(
  topic: string,
  scope: string,
  onProgress?: (msg: string) => void,
  keywords?: string[]
): Promise<SearchResult> {
  if (isGoogleSearchAvailable() && keywords && keywords.length > 0) {
    onProgress?.("Using Google Custom Search...");
    const result = await googleSearchMulti(keywords, scope, onProgress);
    return { ...result, method: "google" };
  }

  // Fallback: Claude web_search
  onProgress?.("Using Claude web search...");
  const result = await searchWithClaude(topic, scope, onProgress, keywords);
  return { ...result, method: "claude-web-search" };
}

// ---- Keyword generation (shared by /api/agent/keywords and process route) ----

export async function generateKeywordsFromThesis(
  thesis: string,
  context?: Record<string, string | undefined>
): Promise<{ keywords: string[]; usage: TokenUsage }> {
  const claude = getClaudeClient();

  let contextBlock = "";
  if (context) {
    const parts: string[] = [];
    if (context.who) parts.push(`Who: ${context.who}`);
    if (context.what) parts.push(`What: ${context.what}`);
    if (context.when) parts.push(`When: ${context.when}`);
    if (context.where) parts.push(`Where: ${context.where}`);
    if (context.why) parts.push(`Why: ${context.why}`);
    if (parts.length > 0) {
      contextBlock = `\n\nAdditional context:\n${parts.join("\n")}`;
    }
  }

  const prompt = `You are a research assistant for Trust Assembly, a civic fact-checking platform.

Given the following thesis that a user wants to fact-check, generate 7–15 search keyword phrases that would be effective for finding relevant articles via Google Search.

Thesis: "${thesis}"${contextBlock}

Guidelines:
- Include the key proper nouns, organizations, and event names
- Include both specific phrases and broader topic terms
- Include keywords that would find BOTH supporting AND contradicting articles
- Include date-related terms if the thesis references a recent event
- Vary between narrow (specific) and broad (topical) keywords
- Each keyword should be 1–4 words

Return ONLY a valid JSON array of strings. Example: ["keyword one", "keyword two"]`;

  try {
    const response = await claude.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const usage: TokenUsage = {
      inputTokens: response.usage?.input_tokens || 0,
      outputTokens: response.usage?.output_tokens || 0,
    };

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return { keywords: fallbackKeywords(thesis), usage };
    }

    const parsed = JSON.parse(extractJSON(textBlock.text));
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return { keywords: fallbackKeywords(thesis), usage };
    }

    const keywords = parsed
      .filter((k: unknown) => typeof k === "string" && k.trim().length > 0)
      .map((k: string) => k.trim())
      .slice(0, 15);

    return { keywords: keywords.length > 0 ? keywords : fallbackKeywords(thesis), usage };
  } catch (e) {
    console.error("[search] Keyword generation failed, using fallback:", e);
    return { keywords: fallbackKeywords(thesis), usage: { inputTokens: 0, outputTokens: 0 } };
  }
}

// ---- Claude web_search fallback (original Stage B approach) ----

async function searchWithClaude(
  topic: string,
  scope: string,
  onProgress?: (msg: string) => void,
  keywords?: string[]
): Promise<{ candidates: ArticleCandidate[]; usage: TokenUsage }> {
  const claude = getClaudeClient();
  const allCandidates: ArticleCandidate[] = [];
  const seenUrls = new Set<string>();
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  let round = 1;

  const keywordHint =
    keywords && keywords.length > 0
      ? `\n\nThe user has identified these search keywords to guide your research:\n${keywords.map((k) => `- ${k}`).join("\n")}`
      : "";

  while (round <= MAX_ROUNDS) {
    onProgress?.(`Search round ${round}...`);

    const previousUrls = allCandidates.map((c) => c.url).join("\n");
    const previousContext =
      allCandidates.length > 0
        ? `\n\nYou have already found these articles (do NOT return duplicates):\n${previousUrls}`
        : "";

    const prompt = `You are a research assistant for Trust Assembly, a civic fact-checking platform.

Your task: Find articles related to this topic that may warrant fact-checking (corrections or affirmations).

Topic: ${topic}
Search scope: ${scope}
Current search round: ${round}
Articles found so far: ${allCandidates.length}${previousContext}${keywordHint}

Search the web and return a JSON array of articles. For each article include:
- url: the article URL
- headline: the article's headline
- publication: the publication name
- summary: brief summary of the main claims
- reasonToCheck: why this article might warrant fact-checking

IMPORTANT: Return ONLY a valid JSON array. Do not include any text before or after the JSON. Example format:
[{"url": "...", "headline": "...", "publication": "...", "summary": "...", "reasonToCheck": "..."}]

If you cannot find any more relevant articles, return an empty array: []`;

    const response = await claude.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 4096,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 10,
        } as never,
      ],
      messages: [{ role: "user", content: prompt }],
    });

    if (response.usage) {
      usage.inputTokens += response.usage.input_tokens;
      usage.outputTokens += response.usage.output_tokens;
    }

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") break;

    let candidates: ArticleCandidate[];
    try {
      candidates = JSON.parse(extractJSON(textBlock.text));
    } catch {
      break;
    }

    if (!Array.isArray(candidates) || candidates.length === 0) break;

    let newCount = 0;
    for (const c of candidates) {
      if (c.url && !seenUrls.has(c.url)) {
        seenUrls.add(c.url);
        allCandidates.push(c);
        newCount++;
      }
    }

    onProgress?.(`Found ${allCandidates.length} articles so far...`);

    if (newCount === 0) break;
    round++;
  }

  return { candidates: allCandidates, usage };
}

// ---- Mechanical fallback for when Sonnet keyword gen fails ----

const STOPWORDS = new Set([
  "the", "and", "for", "that", "this", "with", "are", "was", "were",
  "have", "has", "had", "not", "but", "from", "they", "their", "them",
  "what", "when", "where", "which", "who", "whom", "will", "would",
  "can", "could", "should", "about", "after", "before", "been",
  "being", "does", "into", "more", "most", "over", "same", "some",
  "such", "than", "then", "there", "these", "those", "through",
  "under", "until", "very", "while", "also", "because", "even",
  "each", "other", "many", "much",
]);

function fallbackKeywords(thesis: string): string[] {
  const words = thesis
    .toLowerCase()
    .replace(/[^\w\s'-]/g, " ")
    .split(/\s+/)
    .filter((w: string) => w.length > 3 && !STOPWORDS.has(w));

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const w of words) {
    if (!seen.has(w)) {
      seen.add(w);
      unique.push(w);
    }
  }

  const top = unique.slice(0, 8);
  const result: string[] = [];
  for (let i = 0; i < Math.min(top.length, 5); i++) {
    result.push(`${top[i]} ${top[(i + 1) % top.length]}`);
  }
  for (const w of top.slice(0, 3)) {
    result.push(w);
  }
  return result.length > 0 ? result : [thesis.split(/\s+/).slice(0, 5).join(" ")];
}
