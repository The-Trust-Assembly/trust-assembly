import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { ok, err } from "@/lib/api-utils";
import { escapeHtml } from "@/lib/sanitize";
import { normalizeUrl } from "@/lib/normalize-url";

// GET /api/corrections?url=<url> — browser extension endpoint
// Returns corrections, affirmations, and translations for a given URL.
//
// ── PRIVACY BY DESIGN ──
// This endpoint is intentionally STATELESS and BLIND.
// We do NOT log, store, or record:
//   - The queried URL
//   - The requester's IP address
//   - Any request headers, user-agent strings, or fingerprints
//   - Any association between a user account and the URLs they query
//
// The URL is used solely as an in-memory filter key against existing
// submission data, then discarded. No database writes occur.
// No analytics. No telemetry. No server-side query cache.
//
// The only URLs stored on our servers are article URLs that submitters
// voluntarily publish when creating corrections. A reader's browsing
// activity must never be observable by Trust Assembly.

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return err("url query parameter is required");
  }

  const normalizedUrl = normalizeUrl(url);

  try {
    // Step 1: Find matching submissions from SQL
    const subsResult = await sql`
      SELECT
        s.id, s.submission_type, s.status, s.url,
        s.original_headline, s.replacement, s.reasoning, s.author,
        s.created_at, s.resolved_at, s.deliberate_lie_finding,
        s.org_id,
        u.username AS submitted_by,
        u.display_name, u.gender, u.age, u.country, u.state,
        u.political_affiliation, u.current_streak,
        u.total_wins, u.total_losses,
        o.name AS org_name
      FROM submissions s
      LEFT JOIN users u ON u.id = s.submitted_by
      LEFT JOIN organizations o ON o.id = s.org_id
      WHERE s.status IN ('approved', 'consensus')
        AND s.normalized_url = ${normalizedUrl}
      ORDER BY s.created_at DESC
    `;

    // Step 2: For each submission, get evidence and inline edits
    const corrections: unknown[] = [];
    const affirmations: unknown[] = [];

    for (const sub of subsResult.rows) {
      // Get evidence
      const evidenceResult = await sql`
        SELECT url, explanation, sort_order
        FROM submission_evidence
        WHERE submission_id = ${sub.id}
        ORDER BY sort_order
      `;

      // Get approved inline edits
      const editsResult = await sql`
        SELECT original_text, replacement_text, reasoning
        FROM submission_inline_edits
        WHERE submission_id = ${sub.id} AND approved = TRUE
        ORDER BY sort_order
      `;

      // Calculate trust score
      const totalReviews = (sub.total_wins || 0) + (sub.total_losses || 0);
      const trustScore = totalReviews > 0
        ? Math.round((sub.total_wins || 0) / totalReviews * 100)
        : null;

      // Sanitize all user-generated text fields to prevent stored XSS.
      const safeStr = (v: unknown) => typeof v === "string" ? escapeHtml(v) : v;

      const item = {
        id: sub.id,
        submissionType: sub.submission_type,
        originalHeadline: safeStr(sub.original_headline),
        replacement: safeStr(sub.replacement),
        author: safeStr(sub.author),
        reasoning: safeStr(sub.reasoning),
        evidence: evidenceResult.rows.map(e => ({
          url: safeStr(e.url),
          explanation: safeStr(e.explanation),
        })),
        inlineEdits: editsResult.rows.map(e => ({
          original: safeStr(e.original_text),
          replacement: safeStr(e.replacement_text),
          reasoning: safeStr(e.reasoning),
        })),
        submittedBy: sub.submitted_by || "unknown",
        orgId: sub.org_id || "",
        orgName: safeStr(sub.org_name) || "Unknown Org",
        status: sub.status,
        trustScore,
        profile: {
          displayName: safeStr(sub.display_name || sub.submitted_by || "unknown"),
          gender: sub.gender,
          age: sub.age,
          country: sub.country,
          state: sub.state,
          politicalAffiliation: sub.political_affiliation,
          currentStreak: sub.current_streak || 0,
        },
      };

      if (sub.submission_type === "affirmation") {
        affirmations.push(item);
      } else {
        corrections.push(item);
      }
    }

    // Step 3: Get approved translations (global, not per-URL)
    const transResult = await sql`
      SELECT
        t.id, t.original_text, t.translated_text, t.translation_type,
        t.status, o.name AS org_name
      FROM translations t
      LEFT JOIN organizations o ON o.id = t.org_id
      WHERE t.status = 'approved'
    `;

    const translations = transResult.rows.map(t => ({
      id: t.id,
      original: typeof t.original_text === "string" ? escapeHtml(t.original_text) : t.original_text,
      translated: typeof t.translated_text === "string" ? escapeHtml(t.translated_text) : t.translated_text,
      type: t.translation_type,
      orgName: typeof t.org_name === "string" ? escapeHtml(t.org_name) : "",
      status: t.status,
    }));

    return ok({
      corrections,
      affirmations,
      translations,
      meta: {
        totalReviews: corrections.length + affirmations.length,
        highestConsensus: subsResult.rows.some((s: Record<string, unknown>) => s.status === "consensus"),
      },
    });
  } catch (e) {
    console.error("Error fetching corrections:", e);
    return err("Internal error", 500);
  }
}
