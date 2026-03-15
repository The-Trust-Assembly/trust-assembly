import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, err, forbidden } from "@/lib/api-utils";

const VER = "v5";
const SK_USERS = `ta-u-${VER}`;

async function kvGet(key: string): Promise<unknown> {
  const result = await sql`SELECT value FROM kv_store WHERE key = ${key}`;
  if (result.rows.length === 0 || !result.rows[0].value) return null;
  return JSON.parse(result.rows[0].value);
}

async function kvSet(key: string, value: unknown): Promise<void> {
  const json = JSON.stringify(value);
  await sql`
    INSERT INTO kv_store (key, value, updated_at)
    VALUES (${key}, ${json}, now())
    ON CONFLICT (key)
    DO UPDATE SET value = ${json}, updated_at = now()
  `;
}

// POST /api/admin/award-badge
// Awards a manual badge to a user. Requires admin authentication.
// Body: { username: string, badgeId: string, detail?: string }
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  const body = await request.json();
  const { username, badgeId, detail } = body;

  if (!username || !badgeId) return err("username and badgeId are required");

  const now = new Date().toISOString();

  // Update KV store
  const users = (await kvGet(SK_USERS)) as Record<string, Record<string, unknown>> | null;
  if (!users || !users[username]) return err(`User @${username} not found in KV store`);

  const user = users[username];
  const manualBadges = (user.manualBadges as Array<Record<string, string>>) || [];

  // Check if badge already awarded
  if (manualBadges.some(b => b.id === badgeId)) {
    return err(`Badge "${badgeId}" already awarded to @${username}`);
  }

  manualBadges.push({ id: badgeId, detail: detail || "", awardedAt: now });
  user.manualBadges = manualBadges;
  users[username] = user;
  await kvSet(SK_USERS, users);

  // Audit log
  await sql`
    INSERT INTO audit_log (action, user_id, entity_type, metadata)
    VALUES (
      'Admin: awarded manual badge',
      ${admin.sub}, 'user',
      ${JSON.stringify({ targetUsername: username, badgeId, detail, awardedAt: now, adminUsername: admin.username })}
    )
  `;

  return ok({
    message: `Badge "${badgeId}" awarded to @${username}.`,
    username,
    badgeId,
  });
}
