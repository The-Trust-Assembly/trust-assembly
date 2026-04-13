import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { forbidden, err } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

// GET /api/agent/instances
// -------------------------
// STAGE A STUB: Will list the user's agent instances once Stage B wires
// this up to the agent_instances table (created in migration 020).
// Returns 501 Not Implemented until then. This reserves the URL namespace
// and lets the Stage B frontend call these endpoints without 404ing.
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");
  return err("Not implemented yet — comes online in Stage B of the Agent redesign.", 501);
}

// POST /api/agent/instances
// --------------------------
// STAGE A STUB: Will create a new agent instance (Sentinel/Phantom/Ward)
// once Stage B wires this up. Expected body shape (Stage B):
//   { name, type, domain?, reasoningInstructions?, monthlySpendLimit?, config? }
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");
  return err("Not implemented yet — comes online in Stage B of the Agent redesign.", 501);
}
