import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, err, forbidden } from "@/lib/api-utils";
import { isWildWestMode } from "@/lib/jury-rules";

// POST /api/admin/wild-west-backfill
// Resolves all pending_review AND pending_jury submissions.
// Only runs when Wild West mode is active (< 100 users).
// Safe to call multiple times — only affects pending submissions.
// REQUIRES admin authentication.
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");
  const wildWest = await isWildWestMode();
  if (!wildWest) {
    return err("Wild West mode is not active (100+ users). No backfill needed.");
  }

  const now = new Date().toISOString();

  // Find pending_review AND pending_jury submissions
  const pending = await sql`
    SELECT s.id, s.submitted_by, s.org_id, s.is_di, s.di_partner_id, s.status AS prev_status
    FROM submissions s
    WHERE s.status IN ('pending_review', 'pending_jury')
  `;

  if (pending.rows.length === 0) {
    return ok({ message: "No pending submissions to backfill.", resolved: 0 });
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
        'Wild West backfill: approved pending submission',
        ${admin.sub}, ${sub.org_id}, 'submission', ${sub.id},
        ${JSON.stringify({ backfillTime: now, previousStatus: sub.prev_status, adminUsername: admin.username })}
      )
    `;

    resolved++;
  }

  return ok({
    message: `Wild West backfill complete. ${resolved} submission(s) resolved.`,
    resolved,
  });
}
