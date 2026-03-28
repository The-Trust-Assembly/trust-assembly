import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden, serverError } from "@/lib/api-utils";
import { NextRequest } from "next/server";

// GET /api/admin/check-avatar — debug endpoint to verify avatar persistence
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  try {
    const result = await sql`
      SELECT id, name,
        avatar IS NOT NULL as has_avatar,
        CASE WHEN avatar IS NOT NULL THEN length(avatar) ELSE 0 END as avatar_length,
        CASE WHEN avatar IS NOT NULL THEN left(avatar, 50) ELSE null END as avatar_prefix
      FROM organizations
      ORDER BY name
    `;

    return ok({
      orgs: result.rows,
      timestamp: new Date().toISOString(),
      note: "If has_avatar is false for an org you uploaded to, the UPDATE is not persisting. Check if the avatar column exists: SELECT column_name FROM information_schema.columns WHERE table_name='organizations' AND column_name='avatar';"
    });
  } catch (e) {
    return serverError("GET /api/admin/check-avatar", e);
  }
}
