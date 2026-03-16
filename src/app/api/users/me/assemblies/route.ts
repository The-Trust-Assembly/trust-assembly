import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/api-utils";

// GET /api/users/me/assemblies — list user's joined and followed assemblies
// Reads directly from the relational tables (organization_members, organization_follows).

export async function GET(request: NextRequest) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  // Joined assemblies (via organization_members)
  const joinedResult = await sql`
    SELECT o.id, o.name
    FROM organization_members om
    LEFT JOIN organizations o ON o.id = om.org_id
    WHERE om.user_id = ${session.sub} AND om.is_active = TRUE
    ORDER BY o.name
  `;

  // Followed assemblies (via organization_follows)
  const followedResult = await sql`
    SELECT o.id, o.name
    FROM organization_follows f
    LEFT JOIN organizations o ON o.id = f.org_id
    WHERE f.user_id = ${session.sub}
    ORDER BY o.name
  `;

  return ok({
    joined: joinedResult.rows.map(r => ({ id: r.id, name: r.name || "Unknown Org" })),
    followed: followedResult.rows.map(r => ({ id: r.id, name: r.name || "Unknown Org" })),
  });
}
