import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/api-utils";

// GET /api/users/me/assemblies — list user's joined and followed assemblies
export async function GET(request: NextRequest) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  const [joined, followed] = await Promise.all([
    sql`
      SELECT o.id, o.name
      FROM organization_members om
      JOIN organizations o ON o.id = om.org_id
      WHERE om.user_id = ${session.sub} AND om.is_active = TRUE
    `,
    sql`
      SELECT o.id, o.name
      FROM organization_follows of2
      JOIN organizations o ON o.id = of2.org_id
      WHERE of2.user_id = ${session.sub}
    `,
  ]);

  return ok({
    joined: joined.rows,
    followed: followed.rows,
  });
}
