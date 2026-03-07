import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { ok, err } from "@/lib/api-utils";

// GET /api/corrections?url=<url> — browser extension endpoint
// Returns corrections, affirmations, and translations for a given URL.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return err("url query parameter is required");
  }

  // Fetch approved/consensus corrections and affirmations for this URL
  const submissions = await sql`
    SELECT
      s.id, s.submission_type, s.original_headline, s.replacement,
      s.author, s.reasoning, s.status,
      u.username AS submitted_by,
      u.display_name AS submitted_by_display_name,
      u.total_wins, u.total_losses, u.current_streak,
      u.gender, u.age, u.country, u.state, u.political_affiliation,
      o.name AS org_name
    FROM submissions s
    JOIN users u ON u.id = s.submitted_by
    JOIN organizations o ON o.id = s.org_id
    WHERE s.url = ${url}
      AND s.status IN ('approved', 'consensus')
    ORDER BY s.created_at DESC
  `;

  // Fetch evidence for all matched submissions
  const submissionIds = submissions.rows.map((r) => r.id);

  let evidenceBySubmission: Record<string, Array<{ url: string; explanation: string }>> = {};

  if (submissionIds.length > 0) {
    const evidence = await sql.query(
      `SELECT submission_id, url, explanation
       FROM submission_evidence
       WHERE submission_id = ANY($1)
       ORDER BY sort_order`,
      [submissionIds]
    );

    for (const e of evidence.rows) {
      if (!evidenceBySubmission[e.submission_id]) {
        evidenceBySubmission[e.submission_id] = [];
      }
      evidenceBySubmission[e.submission_id].push({
        url: e.url,
        explanation: e.explanation,
      });
    }
  }

  // Build corrections and affirmations arrays
  const corrections = [];
  const affirmations = [];

  for (const row of submissions.rows) {
    const totalReviews = row.total_wins + row.total_losses;
    const trustScore = totalReviews > 0
      ? Math.round((row.total_wins / totalReviews) * 100)
      : null;

    const item = {
      id: row.id,
      submissionType: row.submission_type,
      originalHeadline: row.original_headline,
      replacement: row.replacement,
      author: row.author,
      reasoning: row.reasoning,
      evidence: evidenceBySubmission[row.id] || [],
      submittedBy: row.submitted_by,
      orgName: row.org_name,
      status: row.status,
      trustScore,
      profile: {
        displayName: row.submitted_by_display_name,
        gender: row.gender,
        age: row.age,
        country: row.country,
        state: row.state,
        politicalAffiliation: row.political_affiliation,
        currentStreak: row.current_streak,
      },
    };

    if (row.submission_type === "correction") {
      corrections.push(item);
    } else {
      affirmations.push(item);
    }
  }

  // Fetch all approved translations — these are global language replacements
  // (e.g. "Enhanced interrogation techniques" → "Torture") applied across all pages
  const translationRows = await sql`
    SELECT
      t.id, t.original_text, t.translated_text, t.translation_type,
      t.status,
      o.name AS org_name
    FROM translations t
    JOIN organizations o ON o.id = t.org_id
    WHERE t.status = 'approved'
    ORDER BY t.created_at DESC
  `;

  const translations = translationRows.rows.map((t) => ({
    id: t.id,
    original: t.original_text,
    translated: t.translated_text,
    type: t.translation_type,
    orgName: t.org_name,
    status: t.status,
  }));

  // Compute meta
  const totalReviews = corrections.length + affirmations.length;
  const highestConsensus = submissions.rows.some((r) => r.status === "consensus");

  return ok({
    corrections,
    affirmations,
    translations,
    meta: {
      totalReviews,
      highestConsensus,
    },
  });
}
