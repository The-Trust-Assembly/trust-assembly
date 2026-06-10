// Trust Assembly Scoring — Marks ledger
// -----------------------------------------
// The imaginary, non-convertible currency (spec A9). Every operation
// is fail-soft: if migration 027 hasn't been run yet, the economy is
// simply disabled and callers proceed without charging or paying.
// Marks failures must never block a verdict, dispute, or review —
// same rule as email sends.
//
// Debits are atomic: the balance check and decrement happen in one
// UPDATE, so concurrent disputes can't double-spend.

import { sql } from "@/lib/db";

export type MarksReason =
  | "new_citizen_grant"
  | "dispute_stake"
  | "juror_pay"
  | "submission_passed"
  | "review_completed"
  | "vindication_refund"
  | "vindication_bonus"
  | "admin_grant";

export interface MarksRefs {
  disputeId?: string;
  submissionId?: string;
  detail?: Record<string, unknown>;
}

// ─── Availability probe ────────────────────────────────────────────

let probe: { enabled: boolean; checkedAt: number } | null = null;
const PROBE_TTL_MS = 5 * 60 * 1000;

export async function marksEnabled(): Promise<boolean> {
  if (probe && Date.now() - probe.checkedAt < PROBE_TTL_MS) return probe.enabled;
  try {
    await sql`SELECT marks_balance FROM users LIMIT 1`;
    await sql`SELECT 1 FROM marks_transactions LIMIT 1`;
    probe = { enabled: true, checkedAt: Date.now() };
  } catch {
    probe = { enabled: false, checkedAt: Date.now() };
  }
  return probe.enabled;
}

export async function getMarksBalance(userId: string): Promise<number | null> {
  if (!(await marksEnabled())) return null;
  try {
    const result = await sql`SELECT marks_balance FROM users WHERE id = ${userId} LIMIT 1`;
    return result.rows.length > 0 ? Number(result.rows[0].marks_balance) : null;
  } catch {
    return null;
  }
}

// ─── Credit ────────────────────────────────────────────────────────

export async function creditMarks(
  userId: string,
  amount: number,
  reason: MarksReason,
  refs: MarksRefs = {}
): Promise<{ ok: boolean; balance?: number }> {
  if (amount <= 0 || !(await marksEnabled())) return { ok: false };
  const client = await sql.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(
      "UPDATE users SET marks_balance = marks_balance + $1 WHERE id = $2 RETURNING marks_balance",
      [Math.floor(amount), userId]
    );
    if (updated.rows.length === 0) {
      await client.query("ROLLBACK");
      return { ok: false };
    }
    await client.query(
      `INSERT INTO marks_transactions (user_id, amount, reason, dispute_id, submission_id, detail)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, Math.floor(amount), reason, refs.disputeId || null, refs.submissionId || null,
       refs.detail ? JSON.stringify(refs.detail) : null]
    );
    await client.query("COMMIT");
    return { ok: true, balance: Number(updated.rows[0].marks_balance) };
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    console.warn(`[marks] credit failed (${reason}, ${amount} to ${userId}):`, e instanceof Error ? e.message : e);
    return { ok: false };
  } finally {
    client.release();
  }
}

// ─── Debit ─────────────────────────────────────────────────────────

export type DebitResult =
  | { ok: true; balance: number }
  | { ok: false; reason: "insufficient"; balance: number }
  | { ok: false; reason: "disabled" | "error" };

export async function debitMarks(
  userId: string,
  amount: number,
  reason: MarksReason,
  refs: MarksRefs = {}
): Promise<DebitResult> {
  if (!(await marksEnabled())) return { ok: false, reason: "disabled" };
  if (amount <= 0) return { ok: false, reason: "error" };

  const client = await sql.connect();
  try {
    await client.query("BEGIN");
    // Atomic check-and-decrement: no row updated means insufficient funds
    const updated = await client.query(
      "UPDATE users SET marks_balance = marks_balance - $1 WHERE id = $2 AND marks_balance >= $1 RETURNING marks_balance",
      [Math.floor(amount), userId]
    );
    if (updated.rows.length === 0) {
      await client.query("ROLLBACK");
      const current = await getMarksBalance(userId);
      return { ok: false, reason: "insufficient", balance: current ?? 0 };
    }
    await client.query(
      `INSERT INTO marks_transactions (user_id, amount, reason, dispute_id, submission_id, detail)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, -Math.floor(amount), reason, refs.disputeId || null, refs.submissionId || null,
       refs.detail ? JSON.stringify(refs.detail) : null]
    );
    await client.query("COMMIT");
    return { ok: true, balance: Number(updated.rows[0].marks_balance) };
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    console.warn(`[marks] debit failed (${reason}, ${amount} from ${userId}):`, e instanceof Error ? e.message : e);
    return { ok: false, reason: "error" };
  } finally {
    client.release();
  }
}

// ─── Convenience: pay a set of jurors, fire-and-forget ─────────────

export async function payJurors(
  jurorIds: string[],
  amountEach: number,
  refs: MarksRefs
): Promise<void> {
  if (amountEach <= 0 || jurorIds.length === 0) return;
  for (const jurorId of jurorIds) {
    await creditMarks(jurorId, amountEach, "juror_pay", refs);
  }
}
