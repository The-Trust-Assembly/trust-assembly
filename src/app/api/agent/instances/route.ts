import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden, err, serverError } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

const MAX_INSTANCES_PER_USER = 12;
const VALID_TYPES = ["sentinel", "phantom", "ward"] as const;
type AgentType = (typeof VALID_TYPES)[number];

// GET /api/agent/instances
// -------------------------
// Lists the authenticated admin's agent instances, ordered by most
// recently updated. Used by the Agent page tab bar to populate the
// list of tabs.
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  try {
    const result = await sql`
      SELECT
        id,
        name,
        type,
        domain,
        color,
        reputation,
        runs_completed,
        status,
        reasoning_instructions,
        monthly_spend_limit,
        config,
        created_at,
        updated_at
      FROM agent_instances
      WHERE user_id = ${admin.sub}
      ORDER BY created_at ASC
    `;
    return ok({ instances: result.rows });
  } catch (e) {
    return serverError("/api/agent/instances GET", e);
  }
}

// POST /api/agent/instances
// --------------------------
// Creates a new agent instance for the authenticated user.
//
// Body:
//   name                  — required, human-readable name
//   type                  — required, one of: sentinel | phantom | ward
//   domain                — optional, free-text domain focus
//   color                 — optional, hex color for accent
//   reasoningInstructions — optional, prepended to every run
//   monthlySpendLimit     — optional, USD cap
//   config                — optional, type-specific JSONB object
//
// For Phantom agents, the config should include substackUrl. If name
// is not provided (or is the default), it auto-derives from the URL
// (e.g. "greenwald.substack.com" → "Greenwald Phantom").
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return err("Invalid JSON body");
  }

  const type = typeof body.type === "string" ? body.type.toLowerCase().trim() : "";
  if (!VALID_TYPES.includes(type as AgentType)) {
    return err(`type must be one of: ${VALID_TYPES.join(", ")}`);
  }

  const config =
    body.config && typeof body.config === "object" && !Array.isArray(body.config)
      ? (body.config as Record<string, unknown>)
      : null;

  let name = typeof body.name === "string" ? body.name.trim() : "";

  // Phantom: auto-derive name from Substack URL if not provided
  if (type === "phantom" && !name && config?.substackUrl && typeof config.substackUrl === "string") {
    try {
      const url = new URL(config.substackUrl);
      const host = url.hostname.replace(/^www\./, "");
      const subdomain = host.split(".")[0];
      if (subdomain) {
        name = subdomain.charAt(0).toUpperCase() + subdomain.slice(1) + " Phantom";
      }
    } catch {
      // Invalid URL — fall through to the "name required" error below
    }
  }

  if (!name) {
    return err("name is required");
  }
  if (name.length > 120) {
    return err("name must be 120 characters or fewer");
  }

  const domain = typeof body.domain === "string" ? body.domain.trim().slice(0, 200) : null;
  const color = typeof body.color === "string" ? body.color.trim().slice(0, 16) : null;
  const reasoningInstructions =
    typeof body.reasoningInstructions === "string"
      ? body.reasoningInstructions.slice(0, 4000)
      : null;

  const monthlySpendLimit =
    typeof body.monthlySpendLimit === "number" && body.monthlySpendLimit >= 0
      ? body.monthlySpendLimit
      : null;

  try {
    // Enforce the 12-instance cap per user
    const countResult = await sql`
      SELECT COUNT(*)::int AS count FROM agent_instances WHERE user_id = ${admin.sub}
    `;
    const currentCount = countResult.rows[0]?.count ?? 0;
    if (currentCount >= MAX_INSTANCES_PER_USER) {
      return err(
        `You've reached the maximum of ${MAX_INSTANCES_PER_USER} agent instances. Delete one first.`,
        409
      );
    }

    const result = await sql`
      INSERT INTO agent_instances (
        user_id, name, type, domain, color,
        reasoning_instructions, monthly_spend_limit, config, status
      )
      VALUES (
        ${admin.sub}, ${name}, ${type}, ${domain}, ${color},
        ${reasoningInstructions}, ${monthlySpendLimit},
        ${config ? JSON.stringify(config) : null}, 'setup'
      )
      RETURNING id, name, type, domain, color, reputation, runs_completed, status,
                reasoning_instructions, monthly_spend_limit, config,
                created_at, updated_at
    `;
    return ok({ instance: result.rows[0] }, 201);
  } catch (e) {
    return serverError("/api/agent/instances POST", e);
  }
}
