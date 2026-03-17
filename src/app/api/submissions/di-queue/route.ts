import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/api-utils";

// GET /api/submissions/di-queue — returns di_pending submissions
// where the current user is the DI partner (pre-approval queue).
// Also returns any relational submissions that haven't been synced
// to the legacy KV store, so the DI review panel can display them.

export async function GET(request: NextRequest) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  // Find all di_pending submissions where the current user is the DI partner.
  // Match on s.di_partner_id directly, OR look up the submitter's current
  // di_partner_id (handles submissions created before DI partnership was migrated
  // to the relational DB, where s.di_partner_id might be NULL).
  const result = await sql`
    SELECT
      s.id, s.submission_type, s.status, s.url, s.original_headline,
      s.replacement, s.reasoning, s.author, s.trusted_skip,
      s.is_di, s.di_partner_id, s.jury_seats,
      s.deliberate_lie_finding, s.survival_count,
      s.created_at, s.resolved_at,
      u.username AS submitted_by,
      u.display_name AS submitted_by_display_name,
      o.id AS org_id,
      o.name AS org_name,
      COALESCE(partner.username, current_partner.username) AS di_partner_username
    FROM submissions s
    LEFT JOIN users u ON u.id = s.submitted_by
    LEFT JOIN organizations o ON o.id = s.org_id
    LEFT JOIN users partner ON partner.id = s.di_partner_id
    LEFT JOIN users current_partner ON current_partner.id = u.di_partner_id
    WHERE s.status = 'di_pending'
      AND (s.di_partner_id = ${session.sub}
           OR (s.is_di = TRUE AND u.di_partner_id = ${session.sub}))
    ORDER BY s.created_at DESC
  `;

  // Backfill: if any submissions have NULL di_partner_id but we matched via user record, fix them
  for (const row of result.rows) {
    if (!row.di_partner_id && row.is_di) {
      await sql`UPDATE submissions SET di_partner_id = ${session.sub} WHERE id = ${row.id} AND di_partner_id IS NULL`;
    }
  }

  // Also fetch evidence for each submission
  const subIds = result.rows.map((r: Record<string, unknown>) => r.id);
  let evidenceMap: Record<string, Array<Record<string, unknown>>> = {};
  if (subIds.length > 0) {
    const evidence = await sql.query(
      `SELECT submission_id, url, explanation, sort_order
       FROM submission_evidence
       WHERE submission_id = ANY($1)
       ORDER BY sort_order`,
      [subIds]
    );
    for (const row of evidence.rows) {
      if (!evidenceMap[row.submission_id]) evidenceMap[row.submission_id] = [];
      evidenceMap[row.submission_id].push(row);
    }
  }

  // Also fetch inline edits
  let editsMap: Record<string, Array<Record<string, unknown>>> = {};
  if (subIds.length > 0) {
    const edits = await sql.query(
      `SELECT submission_id, original_text, replacement_text, reasoning, sort_order
       FROM submission_inline_edits
       WHERE submission_id = ANY($1)
       ORDER BY sort_order`,
      [subIds]
    );
    for (const row of edits.rows) {
      if (!editsMap[row.submission_id]) editsMap[row.submission_id] = [];
      editsMap[row.submission_id].push(row);
    }
  }

  // Transform to the shape the v5 front-end expects
  const submissions = result.rows.map((row: Record<string, unknown>) => ({
    id: row.id,
    submissionType: row.submission_type,
    status: row.status,
    url: row.url,
    originalHeadline: row.original_headline,
    replacement: row.replacement,
    reasoning: row.reasoning,
    author: row.author,
    trustedSkip: row.trusted_skip,
    isDI: row.is_di,
    diPartner: row.di_partner_username,
    diPartnerId: row.di_partner_id,
    jurySeats: row.jury_seats,
    deliberatelieFinding: row.deliberate_lie_finding,
    survivalCount: row.survival_count,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    submittedBy: row.submitted_by || "unknown",
    submittedByDisplayName: row.submitted_by_display_name || "",
    orgId: row.org_id,
    orgName: row.org_name || "Unknown Org",
    evidence: (evidenceMap[row.id as string] || []).map((e) => ({
      url: e.url,
      explanation: e.explanation,
    })),
    inlineEdits: (editsMap[row.id as string] || []).map((e) => ({
      original: e.original_text,
      replacement: e.replacement_text,
      reasoning: e.reasoning,
    })),
    // Front-end expected fields with defaults
    jurors: [],
    votes: {},
    acceptedJurors: [],
    acceptedAt: {},
    crossGroupJurors: [],
    crossGroupVotes: {},
    crossGroupAcceptedJurors: [],
    crossGroupAcceptedAt: {},
    anonMap: {},
    auditTrail: [
      {
        time: row.created_at,
        action: "🤖 Submitted by a Digital Intelligence — awaiting partner pre-approval",
      },
    ],
    _fromRelational: true, // marker so front-end knows the source
  }));

  return ok({ submissions });
}
