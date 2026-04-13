import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { forbidden, err } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

// GET /api/agent/instances/[id]
// ------------------------------
// STAGE A STUB: Will return a single agent instance once Stage B wires
// this up. Owner-scoped.
export async function GET(
  request: NextRequest,
  _ctx: { params: { id: string } }
) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");
  return err("Not implemented yet — comes online in Stage B of the Agent redesign.", 501);
}

// PATCH /api/agent/instances/[id]
// --------------------------------
// STAGE A STUB: Will update an agent instance's settings (name, domain,
// reasoning_instructions, monthly_spend_limit, type-specific config).
// Type itself is immutable after creation.
export async function PATCH(
  request: NextRequest,
  _ctx: { params: { id: string } }
) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");
  return err("Not implemented yet — comes online in Stage B of the Agent redesign.", 501);
}

// DELETE /api/agent/instances/[id]
// ---------------------------------
// STAGE A STUB: Will delete an agent instance. Per CLAUDE.md rule:
// "Do NOT delete existing files without explicit authorization." The
// Stage B implementation will require an explicit { confirm: true } in
// the request body and will NOT delete any associated agent_runs rows
// (they get agent_instance_id set to NULL via ON DELETE SET NULL).
export async function DELETE(
  request: NextRequest,
  _ctx: { params: { id: string } }
) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");
  return err("Not implemented yet — comes online in Stage B of the Agent redesign.", 501);
}
