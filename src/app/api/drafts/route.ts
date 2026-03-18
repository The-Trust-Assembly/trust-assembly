import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-utils";

const MAX_DRAFTS = 10;

// GET /api/drafts — list user's saved drafts
export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return unauthorized();

  const result = await sql`
    SELECT id, url, title, updated_at, created_at
    FROM submission_drafts
    WHERE user_id = ${user.id}
    ORDER BY updated_at DESC
  `;

  return ok({
    drafts: result.rows.map(r => ({
      id: r.id,
      url: r.url,
      title: r.title,
      updatedAt: r.updated_at,
      createdAt: r.created_at,
    })),
  });
}

// POST /api/drafts — save or update a draft (upsert by URL)
export async function POST(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return unauthorized();

  let body;
  try { body = await request.json(); } catch { return err("Invalid JSON"); }

  const { url, title, draftData } = body;
  if (!url || typeof url !== "string") return err("url is required");
  if (url.length > 2000) return err("URL too long (max 2000 characters)");
  if (!draftData || typeof draftData !== "object") return err("draftData is required");
  if (title && typeof title === "string" && title.length > 500) return err("Title too long (max 500 characters)");

  // Check if this is an update to existing draft or a new one
  const existing = await sql`
    SELECT id FROM submission_drafts WHERE user_id = ${user.id} AND url = ${url}
  `;

  if (existing.rows.length === 0) {
    // New draft — enforce max limit
    const countResult = await sql`
      SELECT COUNT(*)::int AS cnt FROM submission_drafts WHERE user_id = ${user.id}
    `;
    if (countResult.rows[0].cnt >= MAX_DRAFTS) {
      return err(`Maximum ${MAX_DRAFTS} saved drafts. Delete one to save a new draft.`, 409);
    }
  }

  const result = await sql`
    INSERT INTO submission_drafts (user_id, url, title, draft_data)
    VALUES (${user.id}, ${url}, ${title || null}, ${JSON.stringify(draftData)})
    ON CONFLICT (user_id, url) DO UPDATE SET
      draft_data = ${JSON.stringify(draftData)},
      title = ${title || null},
      updated_at = now()
    RETURNING id, url, title, updated_at
  `;

  const row = result.rows[0];
  return ok({
    draft: {
      id: row.id,
      url: row.url,
      title: row.title,
      updatedAt: row.updated_at,
    },
  });
}
