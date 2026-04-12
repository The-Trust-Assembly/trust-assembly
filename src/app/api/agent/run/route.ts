import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden, err, serverError } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

// POST /api/agent/run
// ---------------------
// Starts a Trust Assembly Agent fact-checking run. Currently a stub that
// validates input and admin access. Subsequent iterations will:
//   1. Create an agent_runs row in the DB (queued state)
//   2. Kick off a server-side pipeline (search → fetch → analyze → synthesize)
//   3. Return a runId the client can poll for progress
//
// For now this just echoes the input back so the form can be wired up and
// end-to-end tested in the UI without incurring API costs.
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  try {
    const body = await request.json().catch(() => ({}));
    const thesis = typeof body.thesis === "string" ? body.thesis.trim() : "";
    const scope = typeof body.scope === "string" ? body.scope.trim() : "";

    if (!thesis) {
      return err("thesis is required", 400);
    }
    if (thesis.length > 4000) {
      return err("thesis must be 4000 characters or fewer", 400);
    }
    if (!scope) {
      return err("scope is required", 400);
    }

    // TODO: insert into agent_runs table, kick off pipeline
    return ok({
      message:
        "Run accepted (stub). The full pipeline is not yet wired up — this confirms the form posts, admin auth works, and input validation passes.",
      thesis,
      scope,
      status: "stub",
    });
  } catch (e) {
    return serverError("/api/agent/run", e);
  }
}
