import { NextRequest } from "next/server";
import { sql, withTransaction } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, err, notFound, unauthorized, forbidden, serverError } from "@/lib/api-utils";
import { isValidUUID } from "@/lib/validation";

const GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes

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
  if (!isValidUUID(id)) return notFound("Not found");

  const result = await sql`
    SELECT
      s.*,
      u.username AS submitted_by_username,
      u.display_name AS submitted_by_display_name,
      o.name AS org_name
    FROM submissions s
    LEFT JOIN users u ON u.id = s.submitted_by
    LEFT JOIN organizations o ON o.id = s.org_id
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
    LEFT JOIN users u ON u.id = ja.user_id
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
    submitted_by_username: sub.submitted_by_username || "unknown",
    submitted_by_display_name: sub.submitted_by_display_name || "",
    org_name: sub.org_name || "Unknown Org",
    evidence: evidence.rows,
    inlineEdits: inlineEdits.rows,
    votes: votes.rows,
    jurors: jurors.rows.map((j: Record<string, unknown>) => ({
      ...j,
      username: j.username || "unknown",
      display_name: j.display_name || "",
    })),
    linkedEntries: linkedEntries.rows,
  });
}

// DELETE /api/submissions/[id] — delete own submission within 5-minute grace period
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  const { id } = await params;
  if (!isValidUUID(id)) return notFound("Not found");

  try {
    return await withTransaction(async (client) => {
      // Lock the submission row to prevent race conditions
      const result = await client.query(
        "SELECT id, submitted_by, created_at, status FROM submissions WHERE id = $1 FOR UPDATE",
        [id]
      );
      if (result.rows.length === 0) return notFound("Submission not found");

      const sub = result.rows[0];
      if (sub.submitted_by !== session.sub) return forbidden("Can only delete your own submissions");

      const elapsed = Date.now() - new Date(sub.created_at).getTime();
      if (elapsed > GRACE_PERIOD_MS) return err("Grace period expired. Submissions can only be deleted within 5 minutes of creation.");

      // Check if any votes have been cast (inside transaction — atomic with delete)
      const votes = await client.query(
        "SELECT id FROM jury_votes WHERE submission_id = $1 LIMIT 1", [id]
      );
      if (votes.rows.length > 0) return err("Cannot delete — a juror has already begun reviewing.");

      // Delete related data and the submission — all within one transaction
      await client.query("DELETE FROM submission_evidence WHERE submission_id = $1", [id]);
      await client.query("DELETE FROM submission_inline_edits WHERE submission_id = $1", [id]);
      await client.query("DELETE FROM submission_linked_entries WHERE submission_id = $1", [id]);
      await client.query("DELETE FROM jury_assignments WHERE submission_id = $1", [id]);
      await client.query("DELETE FROM submissions WHERE id = $1", [id]);

      return ok({ deleted: true });
    });
  } catch (error) {
    return serverError("DELETE /api/submissions/[id]", error);
  }
}

// PATCH /api/submissions/[id] — edit own submission within 5-minute grace period
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  const { id } = await params;
  if (!isValidUUID(id)) return notFound("Not found");

  const body = await request.json();
  const { originalHeadline, replacement, reasoning } = body;

  const updates: string[] = [];
  const values: unknown[] = [id];
  let idx = 2;

  if (originalHeadline !== undefined) { updates.push(`original_headline = $${idx++}`); values.push(originalHeadline); }
  if (replacement !== undefined) { updates.push(`replacement = $${idx++}`); values.push(replacement); }
  if (reasoning !== undefined) { updates.push(`reasoning = $${idx++}`); values.push(reasoning); }

  if (updates.length === 0) return err("No fields to update");

  try {
    return await withTransaction(async (client) => {
      // Lock the submission row to prevent race conditions
      const result = await client.query(
        "SELECT id, submitted_by, created_at, status FROM submissions WHERE id = $1 FOR UPDATE",
        [id]
      );
      if (result.rows.length === 0) return notFound("Submission not found");

      const sub = result.rows[0];
      if (sub.submitted_by !== session.sub) return forbidden("Can only edit your own submissions");

      const elapsed = Date.now() - new Date(sub.created_at).getTime();
      if (elapsed > GRACE_PERIOD_MS) return err("Grace period expired. Submissions can only be edited within 5 minutes of creation.");

      const votes = await client.query(
        "SELECT id FROM jury_votes WHERE submission_id = $1 LIMIT 1", [id]
      );
      if (votes.rows.length > 0) return err("Cannot edit — a juror has already begun reviewing.");

      await client.query(
        `UPDATE submissions SET ${updates.join(", ")} WHERE id = $1`,
        values
      );

      return ok({ updated: true });
    });
  } catch (error) {
    return serverError("PATCH /api/submissions/[id]", error);
  }
}
