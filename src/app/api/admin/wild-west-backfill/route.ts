import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, err, forbidden } from "@/lib/api-utils";
import { isWildWestMode } from "@/lib/jury-rules";

const VER = "v5";
const SK_SUBS = `ta-s-${VER}`;

async function kvGet(key: string): Promise<unknown> {
  const result = await sql`SELECT value FROM kv_store WHERE key = ${key}`;
  if (result.rows.length === 0 || !result.rows[0].value) return null;
  return JSON.parse(result.rows[0].value);
}

async function kvSet(key: string, value: unknown): Promise<void> {
  const json = JSON.stringify(value);
  await sql`
    INSERT INTO kv_store (key, value, updated_at)
    VALUES (${key}, ${json}, now())
    ON CONFLICT (key)
    DO UPDATE SET value = ${json}, updated_at = now()
  `;
}

// POST /api/admin/wild-west-backfill
// Resolves all pending_review AND pending_jury submissions that have at
// least 1 approval vote (or no votes at all in Wild West mode).
// Also syncs approved status to the KV store so the browser extension
// can see the corrections.
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
  // In Wild West mode, approve even those with no votes yet
  const pending = await sql`
    SELECT s.id, s.submitted_by, s.org_id, s.is_di, s.di_partner_id, s.status AS prev_status
    FROM submissions s
    WHERE s.status IN ('pending_review', 'pending_jury')
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
        'Wild West backfill: approved pending submission',
        ${admin.sub}, ${sub.org_id}, 'submission', ${sub.id},
        ${JSON.stringify({ backfillTime: now, previousStatus: sub.prev_status, adminUsername: admin.username })}
      )
    `;

    resolved++;
  }

  // Sync KV store so the browser extension sees the approved corrections
  let kvResolved = 0;
  const subs = (await kvGet(SK_SUBS)) as Record<string, Record<string, unknown>> | null;

  if (subs) {
    for (const [, sub] of Object.entries(subs)) {
      if (sub.status === "pending_review" || sub.status === "pending_jury") {
        sub.status = "approved";
        sub.resolvedAt = now;
        sub.deliberateLie = false;

        const trail = (sub.auditTrail as Array<Record<string, string>>) || [];
        trail.push({ time: now, action: "Wild West backfill: approved pending submission" });
        sub.auditTrail = trail;

        kvResolved++;
      }
    }

    if (kvResolved > 0) {
      await kvSet(SK_SUBS, subs);
    }
  }

  return ok({
    message: `Wild West backfill complete. SQL: ${resolved}, KV: ${kvResolved} submission(s) resolved.`,
    sqlResolved: resolved,
    kvResolved,
  });
}
