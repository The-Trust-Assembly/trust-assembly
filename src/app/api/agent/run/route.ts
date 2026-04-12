import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden, err, serverError } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

// POST /api/agent/run
// ---------------------
// Starts a Trust Assembly Agent fact-checking run. Inserts a row into
// agent_runs with status='queued' and returns the runId. The pipeline
// itself (search → fetch → analyze → synthesize) is not yet wired up;
// when it is, a background worker will pick up queued rows and update
// their status as it progresses.
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  try {
    const body = await request.json().catch(() => ({}));
    const thesis = typeof body.thesis === "string" ? body.thesis.trim() : "";
    const scope = typeof body.scope === "string" ? body.scope.trim() : "";
    const context = body.context && typeof body.context === "object" ? body.context : null;

    if (!thesis) {
      return err("thesis is required", 400);
    }
    if (thesis.length > 4000) {
      return err("thesis must be 4000 characters or fewer", 400);
    }
    if (!scope) {
      return err("scope is required", 400);
    }

    const result = await sql`
      INSERT INTO agent_runs (user_id, thesis, scope, context, status, stage_message)
      VALUES (${admin.sub}, ${thesis}, ${scope}, ${context ? JSON.stringify(context) : null}, 'queued', 'Queued — waiting for pipeline worker')
      RETURNING id, status, created_at
    `;

    const row = result.rows[0];
    return ok({
      runId: row.id,
      status: row.status,
      createdAt: row.created_at,
      message:
        "Run queued. The pipeline worker is not yet implemented — this row will sit in the queue until the next slice wires up the search/analyze/synthesize stages.",
    });
  } catch (e) {
    return serverError("/api/agent/run", e);
  }
}

