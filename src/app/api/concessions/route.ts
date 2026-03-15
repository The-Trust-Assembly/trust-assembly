import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-utils";

// GET /api/concessions — list concessions (filterable)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId");
  const submissionId = searchParams.get("submissionId");
  const status = searchParams.get("status");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
  const offset = parseInt(searchParams.get("offset") || "0");

  let query = `
    SELECT
      c.id, c.org_id, c.submission_id, c.reasoning, c.status,
      c.recovery, c.recovery_at_resolution, c.created_at, c.rejected_at,
      u.username AS proposed_by_username, u.display_name AS proposed_by_display_name
    FROM concessions c
    JOIN users u ON u.id = c.proposed_by
    WHERE 1=1
  `;
  const params: unknown[] = [];
  let paramIndex = 1;

  if (orgId) {
    query += ` AND c.org_id = $${paramIndex++}`;
    params.push(orgId);
  }
  if (submissionId) {
    query += ` AND c.submission_id = $${paramIndex++}`;
    params.push(submissionId);
  }
  if (status) {
    query += ` AND c.status = $${paramIndex++}`;
    params.push(status);
  }

  query += ` ORDER BY c.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(limit, offset);

  const result = await sql.query(query, params);

  return ok({
    concessions: result.rows,
    limit,
    offset,
  });
}

// POST /api/concessions — create a concession
export async function POST(request: NextRequest) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  const body = await request.json();
  const { submissionId, reasoning } = body;

  if (!submissionId || !reasoning) {
    return err("submissionId and reasoning are required");
  }

  // Look up submission for org_id
  const sub = await sql`
    SELECT id, org_id FROM submissions WHERE id = ${submissionId}
  `;
  if (sub.rows.length === 0) {
    return err("Submission not found", 404);
  }

  const { org_id } = sub.rows[0];

  const result = await sql`
    INSERT INTO concessions (org_id, submission_id, proposed_by, reasoning)
    VALUES (${org_id}, ${submissionId}, ${session.sub}, ${reasoning})
    RETURNING id, org_id, submission_id, status, created_at
  `;

  return ok(result.rows[0], 201);
}
