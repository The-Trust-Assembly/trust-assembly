import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-utils";

// GET /api/drafts/by-url?url=... — get draft by URL (for extension auto-load)
export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return unauthorized();

  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  if (!url) return err("url query parameter is required");

  const result = await sql`
    SELECT id, url, title, draft_data, updated_at, created_at
    FROM submission_drafts
    WHERE user_id = ${user.id} AND url = ${url}
  `;

  if (result.rows.length === 0) {
    return ok({ draft: null });
  }

  const row = result.rows[0];
  return ok({
    draft: {
      id: row.id,
      url: row.url,
      title: row.title,
      draftData: row.draft_data,
      updatedAt: row.updated_at,
      createdAt: row.created_at,
    },
  });
}
