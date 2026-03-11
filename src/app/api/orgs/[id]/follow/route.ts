import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, err, unauthorized, notFound } from "@/lib/api-utils";

// POST /api/orgs/[id]/follow — follow an assembly (view corrections without membership)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  const { id } = await params;

  // Verify org exists
  const orgResult = await sql`
    SELECT id, name FROM organizations WHERE id = ${id}
  `;
  if (orgResult.rows.length === 0) return notFound("Assembly not found");

  // Check if already following
  const existing = await sql`
    SELECT id FROM organization_follows
    WHERE org_id = ${id} AND user_id = ${session.sub}
  `;
  if (existing.rows.length > 0) {
    return err("Already following this assembly", 409);
  }

  await sql`
    INSERT INTO organization_follows (org_id, user_id)
    VALUES (${id}, ${session.sub})
  `;

  return ok({ status: "following", orgId: id, orgName: orgResult.rows[0].name }, 201);
}

// DELETE /api/orgs/[id]/follow — unfollow an assembly
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  const { id } = await params;

  await sql`
    DELETE FROM organization_follows
    WHERE org_id = ${id} AND user_id = ${session.sub}
  `;

  return ok({ status: "unfollowed", orgId: id });
}
