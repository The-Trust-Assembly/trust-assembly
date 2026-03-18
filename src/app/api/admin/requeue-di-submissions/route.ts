import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden, err } from "@/lib/api-utils";

// POST /api/admin/requeue-di-submissions
// Re-queues batch-approved DI submissions that had 0 votes back to di_pending
// so they flow through the proper DI partner review pipeline.
// Admin-only. Safe to run multiple times (idempotent — only targets approved DI subs with 0 votes).

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  const report: string[] = [];
  let totalRequeued = 0;

  try {
    const client = await sql.connect();
    try {
      await client.query("BEGIN");

      // Find approved DI submissions with 0 in-group votes (batch-approved, never reviewed)
      const candidates = await client.query(`
        SELECT s.id, s.submitted_by, s.org_id, s.status, s.resolved_at,
               s.is_di, s.di_partner_id,
               u.username AS submitter_username,
               o.name AS org_name,
               partner.username AS partner_username
        FROM submissions s
        JOIN users u ON u.id = s.submitted_by
        LEFT JOIN organizations o ON o.id = s.org_id
        LEFT JOIN users partner ON partner.id = s.di_partner_id
        WHERE s.status IN ('approved', 'consensus')
          AND s.is_di = TRUE
          AND s.di_partner_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM jury_votes jv
            WHERE jv.submission_id = s.id AND jv.role = 'in_group'
          )
        ORDER BY s.created_at ASC
      `);

      if (candidates.rows.length === 0) {
        await client.query("ROLLBACK");
        return ok({
          success: true,
          totalRequeued: 0,
          report: ["No batch-approved DI submissions with 0 votes found. Nothing to re-queue."],
        });
      }

      for (const sub of candidates.rows) {
        // 1. Reset submission status to di_pending
        await client.query(
          `UPDATE submissions
           SET status = 'di_pending', resolved_at = NULL
           WHERE id = $1`,
          [sub.id]
        );

        // 2. Remove backfilled user_review_history for this submission
        await client.query(
          `DELETE FROM user_review_history WHERE submission_id = $1`,
          [sub.id]
        );

        // 3. Remove backfilled resolution audit log for this submission
        await client.query(
          `DELETE FROM audit_log
           WHERE entity_type = 'submission' AND entity_id = $1
             AND action LIKE 'Submission resolved:%'`,
          [sub.id]
        );

        // 4. Remove any jury assignments (they'll be re-created after DI approval)
        await client.query(
          `DELETE FROM jury_assignments WHERE submission_id = $1`,
          [sub.id]
        );

        // 5. Decrement submitter's total_wins (these were counted as wins)
        const targetUserId = sub.di_partner_id;
        await client.query(
          `UPDATE users SET total_wins = GREATEST(total_wins - 1, 0) WHERE id = $1`,
          [targetUserId]
        );

        report.push(
          `Re-queued ${(sub.id as string).slice(0, 8)}… by @${sub.submitter_username} → @${sub.partner_username} (${sub.org_name})`
        );
        totalRequeued++;
      }

      // 6. Add audit log for this admin action
      await client.query(
        `INSERT INTO audit_log (action, user_id, entity_type, metadata)
         VALUES ($1, $2, 'system', $3)`,
        [
          "Admin: re-queued batch-approved DI submissions",
          admin.sub,
          JSON.stringify({ totalRequeued, submissionIds: candidates.rows.map((r: Record<string, unknown>) => r.id) }),
        ]
      );

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    return ok({
      success: true,
      totalRequeued,
      report,
    });
  } catch (e) {
    return err(`Re-queue failed: ${(e as Error).message}`, 500);
  }
}
