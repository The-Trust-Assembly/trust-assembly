import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { ok, notFound } from "@/lib/api-utils";

// GET /api/submissions/[id] — submission detail with evidence and votes
//
// ── ANONYMITY ──
// Submitter identity is hidden while the submission is under review.
// Only revealed after the submission reaches a terminal status
// (approved, consensus, rejected, consensus_rejected).
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const result = await sql`
    SELECT
      s.*,
      u.username AS submitted_by_username,
      u.display_name AS submitted_by_display_name,
      o.name AS org_name
    FROM submissions s
    JOIN users u ON u.id = s.submitted_by
    JOIN organizations o ON o.id = s.org_id
    WHERE s.id = ${id}
  `;

  if (result.rows.length === 0) return notFound("Submission not found");

  const sub = result.rows[0];

  // Anonymize submitter identity while under review
  const terminalStatuses = ["approved", "consensus", "rejected", "consensus_rejected"];
  if (!terminalStatuses.includes(sub.status)) {
    sub.submitted_by = null;
    sub.submitted_by_username = null;
    sub.submitted_by_display_name = null;
  }

  // Get evidence
  const evidence = await sql`
    SELECT url, explanation, sort_order
    FROM submission_evidence
    WHERE submission_id = ${id}
    ORDER BY sort_order
  `;

  // Get inline edits
  const inlineEdits = await sql`
    SELECT original_text, replacement_text, reasoning, approved
    FROM submission_inline_edits
    WHERE submission_id = ${id}
    ORDER BY sort_order
  `;

  // Get votes (anonymized — no voter identity unless you're the voter)
  const votes = await sql`
    SELECT
      jv.role, jv.approve, jv.note, jv.deliberate_lie,
      jv.newsworthy, jv.interesting, jv.voted_at
    FROM jury_votes jv
    WHERE jv.submission_id = ${id}
    ORDER BY jv.voted_at
  `;

  // Get jury assignments
  const jurors = await sql`
    SELECT
      ja.role, ja.accepted, ja.accepted_at,
      u.username, u.display_name
    FROM jury_assignments ja
    JOIN users u ON u.id = ja.user_id
    WHERE ja.submission_id = ${id} AND ja.accepted = TRUE
    ORDER BY ja.assigned_at
  `;

  // Get linked vault entries
  const linkedEntries = await sql`
    SELECT entry_type, entry_id, label, detail
    FROM submission_linked_entries
    WHERE submission_id = ${id}
  `;

  return ok({
    ...sub,
    evidence: evidence.rows,
    inlineEdits: inlineEdits.rows,
    votes: votes.rows,
    jurors: jurors.rows,
    linkedEntries: linkedEntries.rows,
  });
}
