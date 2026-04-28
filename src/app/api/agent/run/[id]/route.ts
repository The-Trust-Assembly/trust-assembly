import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden, notFound, err, serverError } from "@/lib/api-utils";
import { requireSession } from "@/lib/auth";

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

// PATCH /api/agent/run/[id]
// --------------------------
// Cancel a running run. Sets status to 'cancelled'.
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireSession(request);
  if (!session) return forbidden("Login required");

  try {
    const body = await request.json().catch(() => ({}));

    if (body.action === "cancel") {
      const result = await sql`
        UPDATE agent_runs
        SET status = 'cancelled',
            stage_message = 'Cancelled by user',
            error_message = 'Run cancelled',
            updated_at = now(), completed_at = now()
        WHERE id = ${params.id} AND user_id = ${session.sub}
          AND status NOT IN ('ready', 'completed', 'failed', 'cancelled')
        RETURNING id, status
      `;
      if (result.rows.length === 0) return notFound("Run not found or already finished");
      return ok({ message: "Run cancelled", run: result.rows[0] });
    }

    return err("Unknown action. Use: cancel");
  } catch (e) {
    return serverError(`/api/agent/run/${params.id} PATCH`, e);
  }
}

// DELETE /api/agent/run/[id]
// ---------------------------
// Delete a run and its artifacts. Only works for completed/failed/cancelled runs.
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireSession(request);
  if (!session) return forbidden("Login required");

  try {
    // Only allow deleting terminal runs
    const check = await sql`
      SELECT status FROM agent_runs
      WHERE id = ${params.id} AND user_id = ${session.sub}
      LIMIT 1
    `;
    if (check.rows.length === 0) return notFound("Run not found");

    const status = check.rows[0].status;
    if (!["ready", "completed", "failed", "cancelled"].includes(status)) {
      return err("Can only delete completed, failed, or cancelled runs. Cancel it first.", 409);
    }

    // Delete artifacts first (FK constraint)
    await sql`DELETE FROM agent_run_artifacts WHERE run_id = ${params.id}`;
    await sql`DELETE FROM agent_runs WHERE id = ${params.id} AND user_id = ${session.sub}`;

    return ok({ message: "Run and artifacts deleted" });
  } catch (e) {
    return serverError(`/api/agent/run/${params.id} DELETE`, e);
  }
}
