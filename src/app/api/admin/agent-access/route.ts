import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden, serverError } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

// GET /api/admin/agent-access
// -----------------------------
// Returns the current agent_access flag. This endpoint is intentionally
// NOT admin-gated — the AgentPage reads it on mount to determine whether
// to show the full workspace or just the One-Time flow.
//
// Response: { enabled: boolean }
export async function GET() {
  try {
    const result = await sql`
      SELECT value FROM site_flags WHERE key = 'agent_access' LIMIT 1
    `;
    if (result.rows.length === 0) {
      return ok({ enabled: false });
    }
    const value = result.rows[0].value || {};
    return ok({ enabled: !!value.enabled });
  } catch {
    // If the table doesn't exist yet (migration not run), return false
    return ok({ enabled: false });
  }
}

// POST /api/admin/agent-access
// ------------------------------
// Toggles the agent_access flag. Admin-only.
//
// Body: { enabled: boolean }
//
// When enabled, all logged-in users see the full agent workspace
// (tab bar, agent instances, create new agents). When disabled,
// non-admin users only see the One-Time fact-check flow.
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  try {
    const body = await request.json().catch(() => ({}));
    const enabled = !!body.enabled;

    await sql`
      INSERT INTO site_flags (key, value, updated_at)
      VALUES ('agent_access', ${JSON.stringify({ enabled })}, now())
      ON CONFLICT (key) DO UPDATE
      SET value = ${JSON.stringify({ enabled })}, updated_at = now()
    `;

    return ok({ enabled, message: enabled ? "Agent access enabled for all users." : "Agent access restricted to admin." });
  } catch (e) {
    return serverError("/api/admin/agent-access POST", e);
  }
}
