import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, err, unauthorized, notFound, forbidden } from "@/lib/api-utils";

// GET /api/users/[username] — public profile
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;

  const result = await sql`
    SELECT
      id, username, display_name, gender, age, country, state,
      political_affiliation, bio, is_di,
      total_wins, total_losses, current_streak,
      dispute_wins, dispute_losses, deliberate_lies, created_at
    FROM users WHERE username = ${username.toLowerCase()}
  `;

  if (result.rows.length === 0) return notFound("User not found");

  const user = result.rows[0];

  // Get org memberships (public)
  const orgs = await sql`
    SELECT o.id, o.name, om.is_founder, om.joined_at
    FROM organization_members om
    JOIN organizations o ON o.id = om.org_id
    WHERE om.user_id = ${user.id} AND om.is_active = TRUE
  `;

  return ok({ ...user, organizations: orgs.rows });
}

// PATCH /api/users/[username] — update own profile
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  const { username } = await params;
  if (session.username !== username.toLowerCase()) {
    return forbidden("Can only update your own profile");
  }

  const body = await request.json();
  const allowedFields = ["displayName", "bio", "gender", "age", "country", "state", "politicalAffiliation"];
  const updates: string[] = [];
  const values: unknown[] = [];

  // Build dynamic update — only allowed fields
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      // Convert camelCase to snake_case for DB
      const col = field.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
      updates.push(col);
      values.push(body[field]);
    }
  }

  if (updates.length === 0) return err("No valid fields to update");

  // Validate bio length
  if (body.bio && body.bio.length > 500) {
    return err("Bio must be 500 characters or less");
  }

  // Build and execute update query
  const setClauses = updates.map((col, i) => `${col} = $${i + 2}`).join(", ");
  const query = `UPDATE users SET ${setClauses} WHERE id = $1 RETURNING id, username, display_name, bio`;

  // Use sql.query for dynamic queries
  const result = await sql.query(query, [session.sub, ...values]);

  return ok(result.rows[0]);
}
