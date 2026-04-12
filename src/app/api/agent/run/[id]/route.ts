import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden, notFound, serverError } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

// GET /api/agent/run/[id]
// ------------------------
// Returns the full details of a single agent run, including the batch
// JSONB. Used by the dashboard for polling progress and by the review
// screen to display the synthesized batch for approval. Only the run's
// owner (or an admin who owns the run) can see it.
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  try {
    const result = await sql`
      SELECT
        id,
        user_id,
        thesis,
        scope,
        context,
        status,
        stage_message,
        progress_pct,
        articles_found,
        articles_fetched,
        articles_analyzed,
        batch,
        input_tokens,
        output_tokens,
        estimated_cost_usd,
        error_message,
        created_at,
        updated_at,
        completed_at
      FROM agent_runs
      WHERE id = ${params.id} AND user_id = ${admin.sub}
      LIMIT 1
    `;

    if (result.rows.length === 0) {
      return notFound("Run not found");
    }

    return ok({ run: result.rows[0] });
  } catch (e) {
    return serverError(`/api/agent/run/${params.id}`, e);
  }
}
