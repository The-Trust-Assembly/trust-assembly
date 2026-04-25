import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden, notFound, err, serverError } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

// POST /api/agent/process/[id]/retry
// ------------------------------------
// Retries a failed or stuck run from its last checkpoint.
// Reads batch._checkpoint to determine where to resume:
//   - "search"  → re-queue and restart from fetch (search results saved)
//   - "filter"  → same as search checkpoint
//   - "fetch"   → re-queue and restart from analyze (fetched articles saved)
//   - "analyze" → re-queue and restart from remaining analysis
//   - no checkpoint → re-queue and restart entirely
//
// Resets the run status to 'queued' and fires the process route.
// The process route will detect the checkpoint and skip completed phases.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  try {
    const result = await sql`
      SELECT id, user_id, status, batch, created_at
      FROM agent_runs
      WHERE id = ${params.id} AND user_id = ${admin.sub}
      LIMIT 1
    `;
    if (result.rows.length === 0) return notFound("Run not found");

    const run = result.rows[0];

    // Only allow retry on failed or stuck runs
    const terminalOk = ["failed", "cancelled"];
    const elapsed = Math.round((Date.now() - new Date(run.created_at).getTime()) / 1000);
    const isStuck = !["ready", "completed", "failed", "cancelled", "queued"].includes(run.status) && elapsed > 360;

    if (!terminalOk.includes(run.status) && !isStuck) {
      return err(
        `Run is in status '${run.status}' (${elapsed}s old). Retry is only available for failed runs or runs stuck for >6 minutes.`,
        409
      );
    }

    const batch = run.batch || {};
    const checkpoint = batch._checkpoint || null;

    // Reset to queued so the process route picks it up
    await sql`
      UPDATE agent_runs
      SET status = 'queued',
          stage_message = ${`Retrying from ${checkpoint ? checkpoint + " checkpoint" : "the beginning"}...`},
          progress_pct = 0,
          error_message = NULL,
          completed_at = NULL,
          updated_at = now()
      WHERE id = ${run.id}
    `;

    // Fire-and-forget pipeline kickoff
    const processUrl = new URL(
      `/api/agent/process/${run.id}`,
      request.url
    ).toString();

    fetch(processUrl, {
      method: "POST",
      headers: {
        cookie: request.headers.get("cookie") || "",
        authorization: request.headers.get("authorization") || "",
      },
    }).catch(() => {});

    return ok({
      runId: run.id,
      status: "queued",
      checkpoint,
      message: checkpoint
        ? `Retrying from ${checkpoint} checkpoint. Skipping completed phases.`
        : "Retrying from the beginning (no checkpoint found).",
    });
  } catch (e) {
    return serverError(`/api/agent/process/${params.id}/retry`, e);
  }
}
