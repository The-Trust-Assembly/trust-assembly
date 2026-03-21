import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, err, forbidden } from "@/lib/api-utils";

// GET /api/admin/errors — list errors with filtering
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
  const offset = parseInt(searchParams.get("offset") || "0");
  const resolved = searchParams.get("resolved");
  const errorType = searchParams.get("errorType");
  const apiRoute = searchParams.get("apiRoute");

  let query = `
    SELECT
      ce.*,
      u.username AS user_username,
      ru.username AS resolved_by_username
    FROM client_errors ce
    LEFT JOIN users u ON u.id = ce.user_id
    LEFT JOIN users ru ON ru.id = ce.resolved_by
    WHERE 1=1
  `;
  const params: unknown[] = [];
  let idx = 1;

  if (resolved === "true") {
    query += ` AND ce.resolved = TRUE`;
  } else if (resolved === "false") {
    query += ` AND ce.resolved = FALSE`;
  }
  if (errorType) {
    query += ` AND ce.error_type = $${idx++}`;
    params.push(errorType);
  }
  if (apiRoute) {
    query += ` AND ce.api_route = $${idx++}`;
    params.push(apiRoute);
  }

  query += ` ORDER BY ce.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(limit, offset);

  const result = await sql.query(query, params);
  const total = await sql`SELECT COUNT(*)::int AS count FROM client_errors WHERE resolved = FALSE`;

  return ok({
    errors: result.rows,
    total_unresolved: total.rows[0].count,
    limit,
    offset,
  });
}

// PATCH /api/admin/errors — mark error(s) as resolved
export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  const body = await request.json();
  const { errorId, errorIds, notes } = body;

  const ids = errorIds ?? (errorId ? [errorId] : []);
  if (ids.length === 0) {
    return err("errorId or errorIds required");
  }

  for (const id of ids) {
    await sql`
      UPDATE client_errors
      SET resolved = TRUE, resolved_by = ${admin.sub}, resolved_at = now(),
          resolution_notes = ${notes || null}
      WHERE id = ${id}
    `;
  }

  return ok({ resolved: ids.length });
}
