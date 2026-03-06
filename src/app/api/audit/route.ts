import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { ok } from "@/lib/api-utils";

// GET /api/audit — list audit log entries with pagination
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const orgId = searchParams.get("orgId");
  const entityType = searchParams.get("entityType");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
  const offset = parseInt(searchParams.get("offset") || "0");

  let query = `
    SELECT
      al.id, al.action, al.user_id, al.org_id, al.entity_type,
      al.entity_id, al.metadata, al.created_at,
      u.username, u.display_name
    FROM audit_log al
    LEFT JOIN users u ON u.id = al.user_id
    WHERE 1=1
  `;
  const params: unknown[] = [];
  let paramIndex = 1;

  if (userId) {
    query += ` AND al.user_id = $${paramIndex++}`;
    params.push(userId);
  }
  if (orgId) {
    query += ` AND al.org_id = $${paramIndex++}`;
    params.push(orgId);
  }
  if (entityType) {
    query += ` AND al.entity_type = $${paramIndex++}`;
    params.push(entityType);
  }

  query += ` ORDER BY al.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(limit, offset);

  const result = await sql.query(query, params);

  return ok({
    entries: result.rows,
    limit,
    offset,
  });
}
