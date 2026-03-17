import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, unauthorized, forbidden, err } from "@/lib/api-utils";

// POST /api/admin/set-admin-flag
// Sets is_admin = TRUE for the current user IF their username matches
// the hardcoded admin username. This bypasses requireAdmin() intentionally
// to solve the bootstrap problem where the admin user exists but
// is_admin was never set to TRUE during the KV→relational migration.

const ADMIN_USERNAME = "thekingofamerica";

export async function POST(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return unauthorized();

  // Only the hardcoded admin username can self-promote
  if (user.username !== ADMIN_USERNAME) {
    return forbidden("Only the site admin can use this endpoint");
  }

  try {
    await sql`UPDATE users SET is_admin = TRUE WHERE id = ${user.sub}`;

    await sql`
      INSERT INTO audit_log (action, user_id, entity_type, metadata)
      VALUES ('admin_flag_self_set', ${user.sub}, 'user', '{"source": "set-admin-flag endpoint"}')
    `;

    return ok({ success: true, message: `is_admin set to TRUE for @${user.username}` });
  } catch (e) {
    return err(`Failed to set admin flag: ${(e as Error).message}`, 500);
  }
}
