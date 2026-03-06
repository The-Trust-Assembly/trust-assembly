import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { ok, err } from "@/lib/api-utils";

// GET /api/users/[username]/history — get user review history
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
      urh.id, urh.submission_id, urh.outcome, urh.from_di, urh.created_at,
      s.original_headline, s.submission_type, s.url
    FROM user_review_history urh
    LEFT JOIN submissions s ON s.id = urh.submission_id
    WHERE urh.user_id = ${user.rows[0].id}
    ORDER BY urh.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  return ok({
    history: result.rows,
    limit,
    offset,
  });
}
