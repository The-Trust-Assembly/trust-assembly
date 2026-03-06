import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ok, err, unauthorized, notFound } from "@/lib/api-utils";

// POST /api/orgs/[id]/leave — leave an assembly
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentUser();
  if (!session) return unauthorized();

  const { id } = await params;

  // Verify membership
  const membership = await sql`
    SELECT id FROM organization_members
    WHERE org_id = ${id} AND user_id = ${session.sub} AND is_active = TRUE
  `;
  if (membership.rows.length === 0) return notFound("Not a member of this assembly");

  // Can't leave General Public
  const org = await sql`SELECT is_general_public FROM organizations WHERE id = ${id}`;
  if (org.rows[0]?.is_general_public) {
    return err("Cannot leave the General Public assembly");
  }

  // Deactivate membership
  await sql`
    UPDATE organization_members
    SET is_active = FALSE, left_at = now()
    WHERE org_id = ${id} AND user_id = ${session.sub}
  `;

  // Log to history
  await sql`
    INSERT INTO organization_member_history (org_id, user_id, action)
    VALUES (${id}, ${session.sub}, 'left')
  `;

  // If this was primary org, clear it
  await sql`
    UPDATE users SET primary_org_id = NULL
    WHERE id = ${session.sub} AND primary_org_id = ${id}
  `;

  return ok({ status: "left" });
}
