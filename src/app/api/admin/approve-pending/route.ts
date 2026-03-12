import { sql } from "@/lib/db";
import { ok, err } from "@/lib/api-utils";

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

// POST /api/admin/approve-pending
// Approves ALL currently pending submissions (pending_review AND pending_jury)
// in BOTH the SQL submissions table AND the KV store.
//
// Bug fixes addressed:
// 1. pending_jury submissions were never resolved because the backfill
//    only handled pending_review with existing votes.
// 2. The KV store (read by the browser extension) was never updated
//    by the SQL-side backfill, so approved corrections were invisible
//    to extension users.
export async function POST() {
  const now = new Date().toISOString();
  let sqlResolved = 0;
  let kvResolved = 0;

  // ── 1. Approve pending submissions in SQL database ──

  const pending = await sql`
    SELECT s.id, s.submitted_by, s.org_id, s.is_di, s.di_partner_id
    FROM submissions s
    WHERE s.status IN ('pending_review', 'pending_jury')
  `;

  for (const sub of pending.rows) {
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
        'Admin: approved pending submission',
        ${sub.submitted_by}, ${sub.org_id}, 'submission', ${sub.id},
        ${JSON.stringify({ previousStatus: 'pending', approvedAt: now })}
      )
    `;

    sqlResolved++;
  }

  // ── 2. Approve pending submissions in KV store ──
  // The browser extension reads from here, so this is critical.

  const subs = (await kvGet(SK_SUBS)) as Record<string, Record<string, unknown>> | null;

  if (subs) {
    for (const [id, sub] of Object.entries(subs)) {
      if (sub.status === "pending_review" || sub.status === "pending_jury") {
        sub.status = "approved";
        sub.resolvedAt = now;
        sub.deliberateLie = false;

        // Add audit trail entry
        const trail = (sub.auditTrail as Array<Record<string, string>>) || [];
        trail.push({ time: now, action: "Admin: approved pending submission" });
        sub.auditTrail = trail;

        kvResolved++;
      }
    }

    await kvSet(SK_SUBS, subs);
  }

  return ok({
    message: `Approved all pending corrections. SQL: ${sqlResolved}, KV: ${kvResolved}.`,
    sqlResolved,
    kvResolved,
  });
}
