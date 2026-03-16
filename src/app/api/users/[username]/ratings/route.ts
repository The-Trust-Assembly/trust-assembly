import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { ok, err } from "@/lib/api-utils";

// GET /api/users/[username]/ratings — get user ratings received
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;

  // Look up user
  const user = await sql`
    SELECT id FROM users WHERE username = ${username.toLowerCase()}
  `;
  if (user.rows.length === 0) {
    return err("User not found", 404);
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
  const offset = parseInt(searchParams.get("offset") || "0");

  const result = await sql`
    SELECT
      ur.id, ur.submission_id, ur.newsworthy, ur.interesting, ur.created_at,
      ru.username AS rated_by_username, ru.display_name AS rated_by_display_name,
      s.original_headline, s.url
    FROM user_ratings ur
    LEFT JOIN users ru ON ru.id = ur.rated_by
    LEFT JOIN submissions s ON s.id = ur.submission_id
    WHERE ur.user_id = ${user.rows[0].id}
    ORDER BY ur.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  return ok({
    ratings: result.rows,
    limit,
    offset,
  });
}
