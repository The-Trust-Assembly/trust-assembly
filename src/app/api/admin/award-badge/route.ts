import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, err, forbidden } from "@/lib/api-utils";

// POST /api/admin/award-badge
// Awards a manual badge to a user. Requires admin authentication.
// Body: { username: string, badgeId: string, detail?: string }
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  const body = await request.json();
  const { username, badgeId, detail } = body;

  if (!username || !badgeId) return err("username and badgeId are required");

  // Look up user by username
  const userResult = await sql`SELECT id FROM users WHERE username = ${username.toLowerCase()}`;
  if (userResult.rows.length === 0) return err(`User @${username} not found`);

  const userId = userResult.rows[0].id;

  // Insert badge (unique constraint prevents duplicates)
  try {
    await sql`
      INSERT INTO user_badges (user_id, badge_id, detail)
      VALUES (${userId}, ${badgeId}, ${detail || null})
    `;
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "23505") {
      return err(`Badge "${badgeId}" already awarded to @${username}`);
    }
    throw e;
  }

  // Audit log
  await sql`
    INSERT INTO audit_log (action, user_id, entity_type, metadata)
    VALUES (
      'Admin: awarded manual badge',
      ${admin.sub}, 'user',
      ${JSON.stringify({ targetUsername: username, badgeId, detail, adminUsername: admin.username })}
    )
  `;

  return ok({
    message: `Badge "${badgeId}" awarded to @${username}.`,
    username,
    badgeId,
  });
}
