import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-utils";

// GET /api/drafts/[id] — get single draft with full data
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return unauthorized();

  const { id } = await params;
  const result = await sql`
    SELECT id, url, title, draft_data, updated_at, created_at
    FROM submission_drafts
    WHERE id = ${id} AND user_id = ${user.id}
  `;

  if (result.rows.length === 0) return err("Draft not found", 404);

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

// DELETE /api/drafts/[id] — delete a draft
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return unauthorized();

  const { id } = await params;
  const result = await sql`
    DELETE FROM submission_drafts
    WHERE id = ${id} AND user_id = ${user.id}
    RETURNING id
  `;

  if (result.rows.length === 0) return err("Draft not found", 404);
  return ok({ success: true });
}
