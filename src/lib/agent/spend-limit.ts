// Trust Assembly Agent — monthly spend limit
// -----------------------------------------------
// agent_instances.monthly_spend_limit was stored but never enforced.
// Checks the instance's current-calendar-month spend (sum of
// estimated_cost_usd across its runs) against the limit before a new
// run is allowed to start. A NULL or zero limit means unlimited.

import { sql } from "@/lib/db";

export async function checkMonthlySpendLimit(
  instanceId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const result = await sql`
      SELECT i.monthly_spend_limit,
             COALESCE(SUM(r.estimated_cost_usd), 0) AS month_spend
      FROM agent_instances i
      LEFT JOIN agent_runs r
        ON r.agent_instance_id = i.id
       AND r.created_at >= date_trunc('month', now())
      WHERE i.id = ${instanceId}
      GROUP BY i.monthly_spend_limit
    `;
    if (result.rows.length === 0) return { ok: true }; // unknown instance — other checks handle it

    const limit = Number(result.rows[0].monthly_spend_limit || 0);
    if (limit <= 0) return { ok: true }; // no limit configured

    const spent = Number(result.rows[0].month_spend || 0);
    if (spent >= limit) {
      return {
        ok: false,
        message: `This agent has reached its monthly spend limit ($${spent.toFixed(2)} of $${limit.toFixed(2)}). Raise the limit in the agent's settings or wait until next month.`,
      };
    }
    return { ok: true };
  } catch (e) {
    // Enforcement must never break run creation on a transient error
    console.warn("[agent] spend limit check failed (allowing run):", e instanceof Error ? e.message : e);
    return { ok: true };
  }
}
