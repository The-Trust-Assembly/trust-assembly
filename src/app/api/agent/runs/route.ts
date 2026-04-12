import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden, serverError } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

// GET /api/agent/runs
// ---------------------
// Lists the authenticated admin's recent agent runs (most recent first).
// Returns a lightweight summary — no batch payload — for use in the
// dashboard's "Recent runs" list. Use /api/agent/run/[id] to fetch a
// single run's full details including the batch JSONB.
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  try {
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10) || 20, 100);

    const result = await sql`
      SELECT
        id,
        thesis,
        scope,
        status,
        stage_message,
        progress_pct,
        articles_found,
        articles_fetched,
        articles_analyzed,
        input_tokens,
        output_tokens,
        estimated_cost_usd,
        error_message,
        created_at,
        updated_at,
        completed_at
      FROM agent_runs
      WHERE user_id = ${admin.sub}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;

    return ok({ runs: result.rows });
  } catch (e) {
    return serverError("/api/agent/runs", e);
  }
}
