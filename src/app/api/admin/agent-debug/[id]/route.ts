import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden, notFound, serverError } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

// GET /api/admin/agent-debug/[id]
// ---------------------------------
// Returns the full raw state of an agent run for admin debugging.
// Shows everything: context JSONB (keywords, entities), batch JSONB
// (checkpoints, intermediate results, final output), token counts,
// cost, timing, and error details.
//
// Also returns a computed "diagnosis" with likely failure cause.
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  try {
    const result = await sql`
      SELECT
        r.*,
        i.name AS agent_name,
        i.type AS agent_type,
        i.domain AS agent_domain,
        i.config AS agent_config
      FROM agent_runs r
      LEFT JOIN agent_instances i ON r.agent_instance_id = i.id
      WHERE r.id = ${params.id}
      LIMIT 1
    `;
    if (result.rows.length === 0) return notFound("Run not found");

    const run = result.rows[0];

    // Compute diagnosis
    let diagnosis = "";
    const elapsed = run.completed_at
      ? Math.round((new Date(run.completed_at).getTime() - new Date(run.created_at).getTime()) / 1000)
      : Math.round((Date.now() - new Date(run.created_at).getTime()) / 1000);

    if (run.status === "failed") {
      diagnosis = `Failed: ${run.error_message || "Unknown error"}`;
    } else if (run.status === "ready" || run.status === "completed") {
      diagnosis = `Completed successfully in ${elapsed}s. Cost: $${Number(run.estimated_cost_usd || 0).toFixed(4)}`;
    } else if (elapsed > 360) {
      diagnosis = `LIKELY TIMED OUT — stuck in "${run.status}" for ${elapsed}s (Vercel limit: 300s). The serverless function was killed before it could write a failure state. This run cannot recover automatically.`;
    } else if (elapsed > 120) {
      diagnosis = `Still running (${elapsed}s elapsed). May be processing — check again in 30s.`;
    } else {
      diagnosis = `In progress (${elapsed}s elapsed). Status: ${run.status}.`;
    }

    // Parse batch for checkpoint info
    const batch = run.batch || {};
    const checkpoint = batch._checkpoint || null;

    return ok({
      run: {
        id: run.id,
        status: run.status,
        scope: run.scope,
        thesis: run.thesis,
        stage_message: run.stage_message,
        progress_pct: run.progress_pct,
        error_message: run.error_message,
        articles_found: run.articles_found,
        articles_fetched: run.articles_fetched,
        articles_analyzed: run.articles_analyzed,
        input_tokens: run.input_tokens,
        output_tokens: run.output_tokens,
        estimated_cost_usd: run.estimated_cost_usd,
        created_at: run.created_at,
        updated_at: run.updated_at,
        completed_at: run.completed_at,
        elapsed_seconds: elapsed,
      },
      context: run.context,
      batch_summary: {
        checkpoint,
        has_candidates: !!batch.candidates?.length,
        candidates_count: batch.candidates?.length || 0,
        submissions_count: batch.submissions?.length || 0,
        vault_entries_count: batch.vaultEntries?.length || 0,
        errors_count: batch.errors?.length || 0,
        narrative_length: batch.narrative?.length || 0,
      },
      agent: run.agent_instance_id
        ? {
            name: run.agent_name,
            type: run.agent_type,
            domain: run.agent_domain,
          }
        : null,
      diagnosis,
    });
  } catch (e) {
    return serverError(`/api/admin/agent-debug/${params.id}`, e);
  }
}

// POST /api/admin/agent-debug/[id]
// ----------------------------------
// Admin action to unstick a run. Sets it to 'failed' with an
// explanation, freeing the user to start a new one.
//
// Body: { action: "mark-failed" }
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  try {
    const body = await request.json().catch(() => ({}));

    if (body.action === "mark-failed") {
      const result = await sql`
        UPDATE agent_runs
        SET status = 'failed',
            error_message = 'Manually marked as failed by admin (likely timed out)',
            stage_message = 'Pipeline timed out — marked failed by admin',
            updated_at = now(),
            completed_at = now()
        WHERE id = ${params.id}
          AND status NOT IN ('ready', 'completed', 'failed', 'cancelled')
        RETURNING id, status
      `;
      if (result.rows.length === 0) {
        return notFound("Run not found or already in a terminal state");
      }
      return ok({ message: "Run marked as failed", run: result.rows[0] });
    }

    return ok({ error: "Unknown action. Use: mark-failed" });
  } catch (e) {
    return serverError(`/api/admin/agent-debug/${params.id} POST`, e);
  }
}
