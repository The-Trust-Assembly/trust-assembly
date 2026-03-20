import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { serverError } from "@/lib/api-utils";

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

  return NextResponse.json(entries, {
    status: 200,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Surrogate-Control": "no-store",
      "CDN-Cache-Control": "no-store",
    },
  });
  } catch (error) {
    return serverError("GET /api/data/audit", error);
  }
}
