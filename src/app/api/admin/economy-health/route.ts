import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

// GET /api/admin/economy-health
// ---------------------------------
// One-call observability for the new subsystems: Marks supply and
// flow, scoring activity, and import-service telemetry (which domains
// fail, which generated recipes exist). Each section reports
// enabled:false when its migration (026/027) hasn't been run.
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  // ── Marks ──
  let marks: Record<string, unknown> = { enabled: false };
  try {
    const supply = await sql`
      SELECT COUNT(*)::int AS holders, COALESCE(SUM(marks_balance), 0)::int AS total,
             COALESCE(MIN(marks_balance), 0)::int AS min, COALESCE(MAX(marks_balance), 0)::int AS max
      FROM users
    `;
    const flows = await sql`
      SELECT reason, COUNT(*)::int AS count, SUM(amount)::int AS net
      FROM marks_transactions GROUP BY reason ORDER BY count DESC
    `;
    marks = { enabled: true, supply: supply.rows[0], flowsByReason: flows.rows };
  } catch { /* migration 027 not run */ }

  // ── Scoring ──
  let scoring: Record<string, unknown> = { enabled: false };
  try {
    const totals = await sql`
      SELECT COUNT(DISTINCT user_id)::int AS citizens_scored,
             COALESCE(SUM(points_possible), 0) AS total_possible,
             COALESCE(SUM(rescue_bonus), 0) AS total_rescue,
             COALESCE(SUM(deception_findings), 0)::int AS total_deceptions
      FROM citizen_scores
    `;
    const recentEvents = await sql`
      SELECT event_type, COUNT(*)::int AS count
      FROM score_events WHERE created_at > now() - interval '7 days'
      GROUP BY event_type ORDER BY count DESC
    `;
    scoring = { enabled: true, totals: totals.rows[0], last7DaysByType: recentEvents.rows };
  } catch { /* migration 027 not run */ }

  // ── Import service ──
  let importHealth: Record<string, unknown> = { enabled: false };
  try {
    const failing = await sql`
      SELECT domain, COUNT(*)::int AS attempts,
             COUNT(*) FILTER (WHERE success = FALSE)::int AS failures,
             COUNT(*) FILTER (WHERE body_chars >= 400)::int AS with_body,
             MAX(fetch_error) AS sample_error
      FROM import_logs WHERE created_at > now() - interval '14 days'
      GROUP BY domain
      HAVING COUNT(*) FILTER (WHERE success = FALSE) > 0 OR COUNT(*) FILTER (WHERE body_chars < 400) > 0
      ORDER BY failures DESC, attempts DESC LIMIT 20
    `;
    const recipes = await sql`
      SELECT domain, confidence, generations, updated_at FROM import_recipes
      ORDER BY updated_at DESC LIMIT 20
    `;
    importHealth = { enabled: true, problemDomains: failing.rows, generatedRecipes: recipes.rows };
  } catch { /* migration 026 not run */ }

  return ok({ marks, scoring, import: importHealth });
}
