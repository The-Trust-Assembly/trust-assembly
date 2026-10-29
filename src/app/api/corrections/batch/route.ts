import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { ok, err } from "@/lib/api-utils";
import { normalizeUrl } from "@/lib/normalize-url";
import { escapeHtml } from "@/lib/sanitize";

const MAX_URLS = 40;
const MAX_URL_LENGTH = 4096;

function normalizeRequestedUrls(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_URLS) return null;

  const normalized = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_URL_LENGTH) return null;
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
      normalized.add(normalizeUrl(parsed.toString()));
    } catch {
      return null;
    }
  }
  return [...normalized];
}

// POST /api/corrections/batch — public feed-headline lookup.
//
// PRIVACY BY DESIGN: like GET /api/corrections, this endpoint is stateless and
// blind. The requested URLs are used only as in-memory query keys. This route
// performs no writes and intentionally does not log URLs, headers, identities,
// or request metadata.
export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > 170_000) {
    return err("Request body is too large", 413);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return err("A JSON body is required");
  }

  const urls = normalizeRequestedUrls((body as { urls?: unknown } | null)?.urls);
  if (!urls) {
    return err(`urls must contain between 1 and ${MAX_URLS} valid HTTP(S) URLs`);
  }

  try {
    const result = await sql.query(
      `WITH ranked AS (
         SELECT
           s.id, s.normalized_url, s.original_headline, s.replacement,
           s.org_id, o.name AS org_name, s.status, s.created_at,
           ROW_NUMBER() OVER (
             PARTITION BY s.normalized_url
             ORDER BY CASE WHEN s.status = 'consensus' THEN 0 ELSE 1 END,
                      s.created_at DESC
           ) AS match_rank
         FROM submissions s
         LEFT JOIN organizations o ON o.id = s.org_id
         WHERE s.status IN ('approved', 'consensus')
           AND s.submission_type <> 'affirmation'
           AND s.replacement IS NOT NULL
           AND s.normalized_url = ANY($1::text[])
       )
       SELECT * FROM ranked
       WHERE match_rank <= 5
       ORDER BY normalized_url, match_rank`,
      [urls],
    );

    const results: Record<string, unknown[]> = {};
    for (const row of result.rows) {
      const key = String(row.normalized_url);
      const matches = results[key] || (results[key] = []);
      matches.push({
        id: row.id,
        originalHeadline: typeof row.original_headline === "string" ? escapeHtml(row.original_headline) : "",
        replacement: typeof row.replacement === "string" ? escapeHtml(row.replacement) : "",
        orgId: row.org_id || "",
        orgName: typeof row.org_name === "string" ? escapeHtml(row.org_name) : "Unknown Assembly",
        status: row.status,
      });
    }

    return ok({ results });
  } catch {
    // Do not include request data (including query parameters) in logs.
    console.error("Error fetching correction batch");
    return err("Internal error", 500);
  }
}
