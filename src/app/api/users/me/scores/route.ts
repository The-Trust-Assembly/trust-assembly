import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/api-utils";
import { scoringEnabled } from "@/lib/scoring/accrual";
import { computeScore } from "@/lib/scoring/engine";

export const dynamic = "force-dynamic";

// GET /api/users/me/scores — the four trust scores (spec A1) plus the
// recent score ledger. Assembly-scope rows are aggregated across the
// citizen's assemblies for the headline number; per-org breakdown is
// included for the detail view. Returns { enabled: false } until
// migration 027 has been run.
export async function GET(request: NextRequest) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  if (!(await scoringEnabled())) {
    return ok({ enabled: false });
  }

  try {
    const tallies = await sql`
      SELECT role, scope, org_id, points_earned, points_possible, rescue_bonus, deception_findings
      FROM citizen_scores WHERE user_id = ${session.sub}
    `;

    // Aggregate per role × scope (assembly rows merge across orgs)
    const buckets: Record<string, { pointsEarned: number; pointsPossible: number; rescueBonus: number; deceptionFindings: number }> = {};
    for (const row of tallies.rows) {
      const key = `${row.scope}_${row.role}`;
      const bucket = buckets[key] || { pointsEarned: 0, pointsPossible: 0, rescueBonus: 0, deceptionFindings: 0 };
      bucket.pointsEarned += Number(row.points_earned);
      bucket.pointsPossible += Number(row.points_possible);
      bucket.rescueBonus += Number(row.rescue_bonus);
      bucket.deceptionFindings += Number(row.deception_findings);
      buckets[key] = bucket;
    }

    const scores: Record<string, unknown> = {};
    for (const [key, tally] of Object.entries(buckets)) {
      scores[key] = computeScore(tally);
    }

    const events = await sql`
      SELECT event_type, role, scope, item_type, quality, points_earned, points_possible, bonus,
             submission_id, dispute_id, detail, created_at
      FROM score_events
      WHERE user_id = ${session.sub}
      ORDER BY created_at DESC
      LIMIT 25
    `;

    return ok({ enabled: true, scores, events: events.rows });
  } catch (e) {
    console.warn("[scores] fetch failed:", e instanceof Error ? e.message : e);
    return ok({ enabled: false });
  }
}
