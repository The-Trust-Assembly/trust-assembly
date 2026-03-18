import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden } from "@/lib/api-utils";

// All non-terminal statuses that should be flushed to approved
const PENDING_STATUSES = [
  'pending_jury',     // Waiting for assembly to reach member threshold
  'pending_review',   // Jury drawn but hasn't voted
  'di_pending',       // DI submission awaiting human partner pre-approval
  'cross_review',     // Promoted to cross-group jury but never resolved
];

// POST /api/admin/approve-pending
// Approves ALL currently non-resolved submissions in the SQL
// submissions table. REQUIRES admin authentication.
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");
  const now = new Date().toISOString();
  let resolved = 0;

  // Approve pending submissions in SQL database
  const pending = await sql`
    SELECT s.id, s.submitted_by, s.org_id, s.is_di, s.di_partner_id, s.status AS prev_status
    FROM submissions s
    WHERE s.status IN ('pending_review', 'pending_jury', 'di_pending', 'cross_review')
  `;

  for (const sub of pending.rows) {
    // cross_review submissions were already in-group approved — give them consensus
    const resolvedStatus = sub.prev_status === 'cross_review' ? 'consensus' : 'approved';

    // Credit the win to the submitter (or DI partner)
    const targetUserId = (sub.is_di && sub.di_partner_id) ? sub.di_partner_id : sub.submitted_by;

    // Use sql.connect() for a dedicated client where transactions work.
    const client = await sql.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        "UPDATE submissions SET status = $1, resolved_at = $2, deliberate_lie_finding = FALSE, jury_seats = 1 WHERE id = $3",
        [resolvedStatus, now, sub.id]
      );

      await client.query(
        "UPDATE users SET total_wins = total_wins + 1, current_streak = current_streak + 1 WHERE id = $1",
        [targetUserId]
      );

      await client.query(
        "UPDATE organization_members SET assembly_streak = assembly_streak + 1 WHERE org_id = $1 AND user_id = $2 AND is_active = TRUE",
        [sub.org_id, targetUserId]
      );

      // Graduate linked vault entries
      for (const table of ["vault_entries", "arguments", "beliefs", "translations"]) {
        await client.query(
          `UPDATE ${table} SET status = 'approved', approved_at = $1 WHERE submission_id = $2 AND status = 'pending'`,
          [now, sub.id]
        );
      }

      // Audit log
      await client.query(
        "INSERT INTO audit_log (action, user_id, org_id, entity_type, entity_id, metadata) VALUES ($1, $2, $3, $4, $5, $6)",
        [
          "Admin: approved pending submission",
          admin.sub, sub.org_id, "submission", sub.id,
          JSON.stringify({ previousStatus: sub.prev_status, resolvedAs: resolvedStatus, approvedAt: now, adminUsername: admin.username }),
        ]
      );

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      console.error(`Admin approve-pending transaction failed for ${sub.id}, rolled back:`, e);
      throw e;
    } finally {
      client.release();
    }

    resolved++;
  }

  return ok({
    message: `Approved all pending corrections. ${resolved} submission(s) resolved.`,
    resolved,
  });
}
