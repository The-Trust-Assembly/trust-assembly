import { sql } from "@/lib/db";
import { ok, err } from "@/lib/api-utils";
import { isWildWestMode } from "@/lib/jury-rules";

// POST /api/admin/wild-west-backfill
// Resolves all pending_review submissions that have at least 1 approval vote.
// Only runs when Wild West mode is active (< 100 users).
// Safe to call multiple times — only affects pending_review submissions.
export async function POST() {
  const wildWest = await isWildWestMode();
  if (!wildWest) {
    return err("Wild West mode is not active (100+ users). No backfill needed.");
  }

  const now = new Date().toISOString();

  // Find pending_review submissions with at least 1 approval vote
  const pending = await sql`
    SELECT s.id, s.submitted_by, s.org_id, s.is_di, s.di_partner_id
    FROM submissions s
    WHERE s.status = 'pending_review'
      AND EXISTS (
        SELECT 1 FROM jury_votes jv
        WHERE jv.submission_id = s.id AND jv.approve = TRUE
      )
  `;

  if (pending.rows.length === 0) {
    return ok({ message: "No pending submissions with approvals to backfill.", resolved: 0 });
  }

  let resolved = 0;

  for (const sub of pending.rows) {
    // Resolve the submission as approved
    await sql`
      UPDATE submissions
      SET status = 'approved', resolved_at = ${now}, deliberate_lie_finding = FALSE, jury_seats = 1
      WHERE id = ${sub.id}
    `;

    // Credit the win to the submitter (or DI partner)
    const targetUserId = (sub.is_di && sub.di_partner_id) ? sub.di_partner_id : sub.submitted_by;

    await sql`
      UPDATE users SET
        total_wins = total_wins + 1,
        current_streak = current_streak + 1
      WHERE id = ${targetUserId}
    `;

    await sql`
      UPDATE organization_members SET
        assembly_streak = assembly_streak + 1
      WHERE org_id = ${sub.org_id} AND user_id = ${targetUserId} AND is_active = TRUE
    `;

    // Graduate linked vault entries
    for (const table of ["vault_entries", "arguments", "beliefs", "translations"]) {
      await sql.query(
        `UPDATE ${table} SET status = 'approved', approved_at = $1 WHERE submission_id = $2 AND status = 'pending'`,
        [now, sub.id],
      );
    }

    // Audit log
    await sql`
      INSERT INTO audit_log (action, user_id, org_id, entity_type, entity_id, metadata)
      VALUES (
        'Wild West backfill: resolved pending submission with existing approval',
        ${sub.submitted_by}, ${sub.org_id}, 'submission', ${sub.id},
        ${JSON.stringify({ backfillTime: now })}
      )
    `;

    resolved++;
  }

  return ok({ message: `Wild West backfill complete. ${resolved} submission(s) resolved.`, resolved });
}
