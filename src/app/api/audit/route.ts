import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/api-utils";

// GET /api/audit — list audit log entries with pagination
// Requires authentication. Regular users can only see their own actions
// and actions within their assemblies. Full access requires admin.
export async function GET(request: NextRequest) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized("Authentication required to view audit log");

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const orgId = searchParams.get("orgId");
  const entityType = searchParams.get("entityType");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
  const offset = parseInt(searchParams.get("offset") || "0");

  // Check if user is admin for full access
  const adminResult = await sql`SELECT is_admin FROM users WHERE id = ${session.sub}`;
  const isAdmin = adminResult.rows.length > 0 && adminResult.rows[0].is_admin;

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

  // Non-admin users can only see their own actions
  if (!isAdmin) {
    query += ` AND al.user_id = $${paramIndex++}`;
    params.push(session.sub);
  } else if (userId) {
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
