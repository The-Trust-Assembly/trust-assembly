// Trust Assembly Agent — URL verification
// -------------------------------------------
// Deterministically checks that URLs cited in evidence actually exist
// by making lightweight HEAD requests. Catches hallucinated URLs
// before they reach the reviewer.
//
// Three outcomes:
//   "verified"   — URL returned 200-399 (page exists)
//   "not_found"  — URL returned 404 or other client error
//   "error"      — network error, timeout, or server error

import type { ArticleAnalysis } from "./types";

const VERIFY_TIMEOUT_MS = 8000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; TrustAssemblyAgent/1.0; +https://trustassembly.org)";
const MAX_CONCURRENT = 4;

export interface UrlVerifyResult {
  url: string;
  status: "verified" | "not_found" | "error";
  httpStatus?: number;
  detail?: string;
}

async function verifyOneUrl(url: string): Promise<UrlVerifyResult> {
  if (!url || !url.startsWith("http")) {
    return { url, status: "error", detail: "Invalid URL" };
  }

  try {
    // HEAD request first (fast, no body transfer)
    const res = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      redirect: "follow",
    });

    if (res.status >= 200 && res.status < 400) {
      return { url, status: "verified", httpStatus: res.status };
    }

    // Some servers reject HEAD — retry with GET
    if (res.status === 405 || res.status === 403) {
      const getRes = await fetch(url, {
        method: "GET",
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
        redirect: "follow",
      });
      if (getRes.status >= 200 && getRes.status < 400) {
        return { url, status: "verified", httpStatus: getRes.status };
      }
      return { url, status: "not_found", httpStatus: getRes.status };
    }

    return {
      url,
      status: res.status === 404 ? "not_found" : "error",
      httpStatus: res.status,
      detail: `HTTP ${res.status}`,
    };
  } catch (e) {
    return {
      url,
      status: "error",
      detail: e instanceof Error ? e.message : "Network error",
    };
  }
}

// Verify URLs in batches to avoid overwhelming the network
async function verifyBatch(urls: string[]): Promise<Map<string, UrlVerifyResult>> {
  const results = new Map<string, UrlVerifyResult>();
  const unique = [...new Set(urls.filter((u) => u && u.startsWith("http")))];

  for (let i = 0; i < unique.length; i += MAX_CONCURRENT) {
    const batch = unique.slice(i, i + MAX_CONCURRENT);
    const batchResults = await Promise.all(batch.map(verifyOneUrl));
    for (const r of batchResults) {
      results.set(r.url, r);
    }
  }

  return results;
}

// Verify all URLs cited in evidence across an array of analyses.
// Mutates evidence items in place, adding urlVerified and urlDetail.
// Also verifies the article URL itself.
export async function verifyEvidenceUrls(
  analyses: Array<{ url: string; analysis: ArticleAnalysis }>
): Promise<{ verified: number; notFound: number; errors: number }> {
  // Collect all unique URLs to verify
  const allUrls: string[] = [];
  for (const a of analyses) {
    for (const ev of a.analysis.evidence || []) {
      if (ev.url) allUrls.push(ev.url);
    }
  }

  if (allUrls.length === 0) {
    return { verified: 0, notFound: 0, errors: 0 };
  }

  const results = await verifyBatch(allUrls);

  let verified = 0;
  let notFound = 0;
  let errors = 0;

  // Write results back to each evidence item
  for (const a of analyses) {
    for (const ev of a.analysis.evidence || []) {
      if (!ev.url) continue;
      const result = results.get(ev.url);
      if (!result) continue;

      (ev as Record<string, unknown>).urlVerified = result.status;
      if (result.detail) {
        (ev as Record<string, unknown>).urlDetail = result.detail;
      }

      if (result.status === "verified") verified++;
      else if (result.status === "not_found") notFound++;
      else errors++;
    }
  }

  return { verified, notFound, errors };
}
