import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden, serverError } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

// GET /api/admin/agent-runs
// ---------------------------
// Lists all agent runs across all users for admin monitoring.
// Shows status, timing, cost, and whether the run is stuck.
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  try {
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);

    const result = await sql`
      SELECT
        r.id, r.user_id, r.thesis, r.scope, r.status,
        r.stage_message, r.progress_pct,
        r.articles_found, r.articles_fetched, r.articles_analyzed,
        r.input_tokens, r.output_tokens, r.estimated_cost_usd,
        r.error_message, r.created_at, r.updated_at, r.completed_at,
        u.username
      FROM agent_runs r
      LEFT JOIN users u ON u.id = r.user_id
      ORDER BY r.created_at DESC
      LIMIT ${limit}
    `;

    return ok({ runs: result.rows });
  } catch (e) {
    return serverError("/api/admin/agent-runs", e);
  }
}
