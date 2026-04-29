import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden, err, serverError } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

// GET /api/admin/agent-prompts
// ------------------------------
// Returns all prompt presets for the admin editor.
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  try {
    const result = await sql`
      SELECT key, label, description, body, updated_at, updated_by
      FROM agent_prompts
      ORDER BY key ASC
    `;
    return ok({ prompts: result.rows });
  } catch {
    return ok({ prompts: [] });
  }
}

// POST /api/admin/agent-prompts
// --------------------------------
// Create or update a prompt preset.
// Body: { key, label?, description?, body }
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  try {
    const body = await request.json().catch(() => ({}));
    const key = typeof body.key === "string" ? body.key.trim() : "";
    const promptBody = typeof body.body === "string" ? body.body : "";

    if (!key) return err("key is required");
    if (!promptBody) return err("body is required");

    const label = typeof body.label === "string" ? body.label.trim() : key;
    const description = typeof body.description === "string" ? body.description.trim() : "";

    await sql`
      INSERT INTO agent_prompts (key, label, description, body, updated_at, updated_by)
      VALUES (${key}, ${label}, ${description}, ${promptBody}, now(), ${admin.username || "admin"})
      ON CONFLICT (key) DO UPDATE
      SET body = ${promptBody},
          label = ${label},
          description = ${description},
          updated_at = now(),
          updated_by = ${admin.username || "admin"}
    `;

    return ok({ message: `Prompt "${key}" saved.`, key });
  } catch (e) {
    return serverError("/api/admin/agent-prompts POST", e);
  }
}
