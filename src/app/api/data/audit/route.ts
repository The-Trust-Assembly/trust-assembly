import { sql } from "@/lib/db";
import { ok, serverError } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

// GET /api/data/audit — returns audit log entries as an array
// in the format the v5 SPA expects: [{ time, action }, ...]
export async function GET() {
  try {
  const result = await sql`
    SELECT
      al.action, al.created_at,
      u.username
    FROM audit_log al
    LEFT JOIN users u ON u.id = al.user_id
    ORDER BY al.created_at ASC
    LIMIT 5000
  `;

  const entries = result.rows.map((row: Record<string, unknown>) => ({
    time: row.created_at,
    action: row.action as string,
  }));

  return ok(entries);
  } catch (error) {
    return serverError("GET /api/data/audit", error);
  }
}
