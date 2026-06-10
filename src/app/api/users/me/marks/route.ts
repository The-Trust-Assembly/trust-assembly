import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/api-utils";
import { marksEnabled, getMarksBalance } from "@/lib/scoring/marks";
import { CURRENCY_NAME, DISPUTE_BASE_FILING_FEE_MARKS } from "@/lib/scoring/constants";

export const dynamic = "force-dynamic";

// GET /api/users/me/marks — wallet balance + recent ledger.
// Returns { enabled: false } until migration 027 has been run.
export async function GET(request: NextRequest) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  if (!(await marksEnabled())) {
    return ok({ enabled: false, currency: CURRENCY_NAME });
  }

  const balance = await getMarksBalance(session.sub);

  let transactions: unknown[] = [];
  try {
    const result = await sql`
      SELECT id, amount, reason, dispute_id, submission_id, detail, created_at
      FROM marks_transactions
      WHERE user_id = ${session.sub}
      ORDER BY created_at DESC
      LIMIT 25
    `;
    transactions = result.rows;
  } catch { /* ledger unavailable — balance alone is still useful */ }

  return ok({
    enabled: true,
    currency: CURRENCY_NAME,
    balance,
    baseDisputeFee: DISPUTE_BASE_FILING_FEE_MARKS,
    transactions,
  });
}
