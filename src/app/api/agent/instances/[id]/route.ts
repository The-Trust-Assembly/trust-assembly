import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden, notFound, err, serverError } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

const VALID_STATUSES = ["setup", "active", "paused", "idle"] as const;
type AgentStatus = (typeof VALID_STATUSES)[number];

// GET /api/agent/instances/[id]
// ------------------------------
// Returns one agent instance by id. Owner-scoped.
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  try {
    const result = await sql`
      SELECT id, user_id, name, type, domain, color,
             reputation, runs_completed, status,
             reasoning_instructions, monthly_spend_limit, config,
             created_at, updated_at
      FROM agent_instances
      WHERE id = ${params.id} AND user_id = ${admin.sub}
      LIMIT 1
    `;
    if (result.rows.length === 0) return notFound("Agent instance not found");
    return ok({ instance: result.rows[0] });
  } catch (e) {
    return serverError(`/api/agent/instances/${params.id} GET`, e);
  }
}

// PATCH /api/agent/instances/[id]
// --------------------------------
// Updates mutable fields on an agent instance. Type is immutable after
// creation — to change type, delete and recreate.
//
// Allowed fields: name, domain, color, status, reasoning_instructions,
// monthly_spend_limit, config
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return err("Invalid JSON body");
  }

  // Verify ownership before any update
  const existing = await sql`
    SELECT id FROM agent_instances
    WHERE id = ${params.id} AND user_id = ${admin.sub}
    LIMIT 1
  `;
  if (existing.rows.length === 0) return notFound("Agent instance not found");

  // Collect updates individually — @vercel/postgres does not support dynamic
  // SET clauses, so we build a series of UPDATE statements and run only the
  // ones that have corresponding fields in the body.
  try {
    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) return err("name cannot be empty");
      if (name.length > 120) return err("name must be 120 characters or fewer");
      await sql`UPDATE agent_instances SET name = ${name}, updated_at = now() WHERE id = ${params.id}`;
    }

    if (body.domain !== undefined) {
      const domain = typeof body.domain === "string" ? body.domain.trim().slice(0, 200) : null;
      await sql`UPDATE agent_instances SET domain = ${domain}, updated_at = now() WHERE id = ${params.id}`;
    }

    if (body.color !== undefined) {
      const color = typeof body.color === "string" ? body.color.trim().slice(0, 16) : null;
      await sql`UPDATE agent_instances SET color = ${color}, updated_at = now() WHERE id = ${params.id}`;
    }

    if (typeof body.status === "string") {
      const status = body.status.toLowerCase().trim();
      if (!VALID_STATUSES.includes(status as AgentStatus)) {
        return err(`status must be one of: ${VALID_STATUSES.join(", ")}`);
      }
      await sql`UPDATE agent_instances SET status = ${status}, updated_at = now() WHERE id = ${params.id}`;
    }

    if (body.reasoningInstructions !== undefined) {
      const instructions =
        typeof body.reasoningInstructions === "string"
          ? body.reasoningInstructions.slice(0, 4000)
          : null;
      await sql`UPDATE agent_instances SET reasoning_instructions = ${instructions}, updated_at = now() WHERE id = ${params.id}`;
    }

    if (body.monthlySpendLimit !== undefined) {
      const limit =
        typeof body.monthlySpendLimit === "number" && body.monthlySpendLimit >= 0
          ? body.monthlySpendLimit
          : null;
      await sql`UPDATE agent_instances SET monthly_spend_limit = ${limit}, updated_at = now() WHERE id = ${params.id}`;
    }

    if (body.config !== undefined) {
      const config =
        body.config && typeof body.config === "object" && !Array.isArray(body.config)
          ? JSON.stringify(body.config)
          : null;
      await sql`UPDATE agent_instances SET config = ${config}, updated_at = now() WHERE id = ${params.id}`;
    }

    const updated = await sql`
      SELECT id, name, type, domain, color, reputation, runs_completed, status,
             reasoning_instructions, monthly_spend_limit, config,
             created_at, updated_at
      FROM agent_instances WHERE id = ${params.id}
    `;
    return ok({ instance: updated.rows[0] });
  } catch (e) {
    return serverError(`/api/agent/instances/${params.id} PATCH`, e);
  }
}

// DELETE /api/agent/instances/[id]
// ---------------------------------
// Deletes an agent instance. Per CLAUDE.md "no deletion without explicit
// authorization" rule, requires { confirm: true } in the request body.
// Does NOT delete associated agent_runs rows — they get agent_instance_id
// set to NULL via the ON DELETE SET NULL FK, preserving the user's run
// history.
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // Empty body — will fall through to the confirm check
  }

  if (body.confirm !== true) {
    return err(
      "Deletion requires explicit confirmation. Send { \"confirm\": true } in the request body.",
      400
    );
  }

  try {
    const result = await sql`
      DELETE FROM agent_instances
      WHERE id = ${params.id} AND user_id = ${admin.sub}
      RETURNING id, name
    `;
    if (result.rows.length === 0) return notFound("Agent instance not found");
    return ok({ deleted: result.rows[0] });
  } catch (e) {
    return serverError(`/api/agent/instances/${params.id} DELETE`, e);
  }
}
