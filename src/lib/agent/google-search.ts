// Trust Assembly Agent — Google Custom Search wrapper
// -----------------------------------------------------
// Calls the Google Custom Search JSON API to find articles matching
// user-edited keywords. Returns ArticleCandidate[] (same shape as the
// Claude web_search path) so the rest of the pipeline is agnostic to
// the discovery method.
//
// Credentials are checked at call time (not import time) to match the
// lazy-init pattern in claude-client.ts. When either env var is missing,
// isGoogleSearchAvailable() returns false and the pipeline falls back
// to the existing Claude web_search approach.
//
// Env vars:
//   GOOGLE_SEARCH_API_KEY — API key from Google Cloud Console
//   GOOGLE_CX             — Search Engine ID from Programmable Search Engine

import type { ArticleCandidate, TokenUsage } from "./types";

const CSE_ENDPOINT = "https://www.googleapis.com/customsearch/v1";
const MAX_KEYWORDS = 15;

// Google CSE allows max 10 results per request
const GOOGLE_MAX_PER_REQUEST = 10;

export function isGoogleSearchAvailable(): boolean {
  return !!(process.env.GOOGLE_SEARCH_API_KEY && process.env.GOOGLE_CX);
}

// Map the UI scope presets to Google search parameters
function scopeToParams(scope: string): { num: number; maxQueries: number; dateRestrict?: string } {
  switch (scope) {
    case "single":
      return { num: 1, maxQueries: 3 };
    case "top3":
      return { num: 3, maxQueries: 5 };
    case "top10":
      return { num: 10, maxQueries: 7 };
    case "pages5":
      return { num: 10, maxQueries: MAX_KEYWORDS };
    case "max":
      return { num: 10, maxQueries: MAX_KEYWORDS };
    case "30d":
      return { num: 10, maxQueries: MAX_KEYWORDS, dateRestrict: "d30" };
    default:
      return { num: 10, maxQueries: 5 };
  }
}

interface GoogleCSEItem {
  title?: string;
  link?: string;
  snippet?: string;
  displayLink?: string;
}

// Single query against Google Custom Search
async function googleSearchSingle(
  query: string,
  num: number,
  dateRestrict?: string
): Promise<ArticleCandidate[]> {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_CX;
  if (!apiKey || !cx) return [];

  const params = new URLSearchParams({
    key: apiKey,
    cx,
    q: query,
    num: String(Math.min(num, GOOGLE_MAX_PER_REQUEST)),
  });
  if (dateRestrict) params.set("dateRestrict", dateRestrict);

  try {
    const res = await fetch(`${CSE_ENDPOINT}?${params.toString()}`, {
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.error(`[google-search] API returned ${res.status} for query "${query}"`);
      return [];
    }

    const data = await res.json();
    const items: GoogleCSEItem[] = data.items || [];

    return items
      .filter((item) => item.link)
      .map((item) => ({
        url: item.link!,
        headline: item.title || "",
        publication: item.displayLink || "",
        summary: item.snippet || "",
        reasonToCheck: "", // Populated later by the Haiku relevance filter
      }));
  } catch (e) {
    console.error(`[google-search] Error for query "${query}":`, e);
    return [];
  }
}

// Run multiple keyword queries, deduplicate by URL
export async function googleSearchMulti(
  keywords: string[],
  scope: string,
  onProgress?: (msg: string) => void
): Promise<{ candidates: ArticleCandidate[]; usage: TokenUsage }> {
  const { num, maxQueries, dateRestrict } = scopeToParams(scope);
  const trimmedKeywords = keywords.slice(0, MAX_KEYWORDS).slice(0, maxQueries);

  const seenUrls = new Set<string>();
  const candidates: ArticleCandidate[] = [];

  for (let i = 0; i < trimmedKeywords.length; i++) {
    const kw = trimmedKeywords[i];
    onProgress?.(`Google search: "${kw}" (${i + 1}/${trimmedKeywords.length})...`);

    const results = await googleSearchSingle(kw, num, dateRestrict);

    for (const r of results) {
      if (!seenUrls.has(r.url)) {
        seenUrls.add(r.url);
        candidates.push(r);
      }
    }
  }

  onProgress?.(`Google search complete: ${candidates.length} unique results from ${trimmedKeywords.length} queries.`);

  // No LLM cost — Google search is an external HTTP call.
  // Cost is tracked externally (Google billing, not Anthropic).
  return { candidates, usage: { inputTokens: 0, outputTokens: 0 } };
}
