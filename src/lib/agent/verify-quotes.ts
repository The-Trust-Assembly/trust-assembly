// Trust Assembly Agent — quote verification
// ---------------------------------------------
// Deterministically verifies that quotes cited in evidence actually
// appear in the source article text. No LLM calls — pure string
// matching with fuzzy fallback.
//
// Three outcomes per quote:
//   "verified"    — exact substring match found
//   "approximate" — fuzzy match within edit distance threshold
//   "not_found"   — no match found in the article text

import type { ArticleAnalysis } from "./types";

// Normalize whitespace and case for comparison
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’“”]/g, "'") // smart quotes → straight
    .replace(/—/g, "-") // em dash
    .replace(/–/g, "-") // en dash
    .replace(/\s+/g, " ")
    .trim();
}

// Check if a quote appears as an exact substring (after normalization)
function exactMatch(articleText: string, quote: string): { found: boolean; position: number } {
  const normArticle = normalize(articleText);
  const normQuote = normalize(quote);

  if (normQuote.length < 10) {
    return { found: false, position: -1 };
  }

  const pos = normArticle.indexOf(normQuote);
  return { found: pos >= 0, position: pos };
}

// Sliding-window fuzzy match: find the best-matching window of the
// quote's length in the article text. Uses character-level overlap
// ratio instead of full edit distance (much faster for long texts).
function fuzzyMatch(
  articleText: string,
  quote: string,
  threshold = 0.8
): { found: boolean; similarity: number; position: number; matchedText: string } {
  const normArticle = normalize(articleText);
  const normQuote = normalize(quote);

  if (normQuote.length < 15) {
    return { found: false, similarity: 0, position: -1, matchedText: "" };
  }

  // Try progressively shorter substrings of the quote
  // (handles cases where the model slightly truncated or extended)
  const windowSize = normQuote.length;
  let bestSimilarity = 0;
  let bestPosition = -1;
  let bestText = "";

  // Slide a window across the article
  const step = Math.max(1, Math.floor(windowSize / 10));
  for (let i = 0; i <= normArticle.length - windowSize; i += step) {
    const window = normArticle.substring(i, i + windowSize);
    const sim = characterOverlap(normQuote, window);

    if (sim > bestSimilarity) {
      bestSimilarity = sim;
      bestPosition = i;
      bestText = articleText.substring(i, i + windowSize);

      if (sim >= 0.95) break; // Close enough, stop early
    }
  }

  // Refine: search around the best position with step=1
  if (bestSimilarity >= threshold * 0.9 && step > 1) {
    const searchStart = Math.max(0, bestPosition - step);
    const searchEnd = Math.min(normArticle.length - windowSize, bestPosition + step);
    for (let i = searchStart; i <= searchEnd; i++) {
      const window = normArticle.substring(i, i + windowSize);
      const sim = characterOverlap(normQuote, window);
      if (sim > bestSimilarity) {
        bestSimilarity = sim;
        bestPosition = i;
        bestText = articleText.substring(i, i + windowSize);
      }
    }
  }

  return {
    found: bestSimilarity >= threshold,
    similarity: Math.round(bestSimilarity * 100) / 100,
    position: bestPosition,
    matchedText: bestText,
  };
}

// Character-level overlap: what fraction of bigrams in a appear in b
function characterOverlap(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0;

  const bigramsA = new Set<string>();
  for (let i = 0; i < a.length - 1; i++) {
    bigramsA.add(a.substring(i, i + 2));
  }

  const bigramsB = new Set<string>();
  for (let i = 0; i < b.length - 1; i++) {
    bigramsB.add(b.substring(i, i + 2));
  }

  let overlap = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) overlap++;
  }

  const union = new Set([...bigramsA, ...bigramsB]).size;
  return union === 0 ? 0 : overlap / union;
}

// Verify all quotes in an analysis against the source article text.
// Mutates the evidence array in place, adding quoteVerified and
// quoteContext fields.
export function verifyQuotes(
  analysis: ArticleAnalysis,
  articleText: string
): { verified: number; approximate: number; notFound: number; total: number } {
  let verified = 0;
  let approximate = 0;
  let notFound = 0;

  for (const ev of analysis.evidence) {
    if (!ev.quote || ev.quote.trim().length < 10) {
      // No quote provided or too short to verify
      continue;
    }

    // Try exact match first
    const exact = exactMatch(articleText, ev.quote);
    if (exact.found) {
      ev.quoteVerified = "verified";
      ev.quoteContext = `Exact match found at position ${exact.position}`;
      verified++;
      continue;
    }

    // Try fuzzy match
    const fuzzy = fuzzyMatch(articleText, ev.quote);
    if (fuzzy.found) {
      ev.quoteVerified = "approximate";
      ev.quoteContext = `${Math.round(fuzzy.similarity * 100)}% match found`;
      approximate++;
      continue;
    }

    ev.quoteVerified = "not_found";
    ev.quoteContext = "Quote not found in article text";
    notFound++;
  }

  return {
    verified,
    approximate,
    notFound,
    total: verified + approximate + notFound,
  };
}
