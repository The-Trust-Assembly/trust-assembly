import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, err, unauthorized, notFound } from "@/lib/api-utils";

// POST /api/orgs/[id]/join — join or apply to an assembly
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  // Verify org exists
  const orgResult = await sql`
    SELECT id, name, enrollment_mode, sponsors_required
    FROM organizations WHERE id = ${id}
  `;
  if (orgResult.rows.length === 0) return notFound("Assembly not found");
  const org = orgResult.rows[0];

  // Check if already a member
  const membership = await sql`
    SELECT id, is_active FROM organization_members
    WHERE org_id = ${id} AND user_id = ${session.sub}
  `;
  if (membership.rows.length > 0 && membership.rows[0].is_active) {
    return err("Already a member of this assembly", 409);
  }

  // Check org limit
  const orgCount = await sql`
    SELECT COUNT(*) as count FROM organization_members
    WHERE user_id = ${session.sub} AND is_active = TRUE
  `;
  if (parseInt(orgCount.rows[0].count) >= 12) {
    return err("Maximum of 12 assembly memberships reached");
  }

  // Handle based on enrollment mode
  if (org.enrollment_mode === "open") {
    // Direct join
    if (membership.rows.length > 0) {
      // Re-activate
      await sql`
        UPDATE organization_members SET is_active = TRUE, left_at = NULL, joined_at = now()
        WHERE org_id = ${id} AND user_id = ${session.sub}
      `;
    } else {
      await sql`
        INSERT INTO organization_members (org_id, user_id)
        VALUES (${id}, ${session.sub})
      `;
    }

    await sql`
      INSERT INTO organization_member_history (org_id, user_id, action)
      VALUES (${id}, ${session.sub}, 'joined')
    `;

    return ok({ status: "joined", orgId: id, orgName: org.name }, 201);
  }

  // Tribal or sponsor mode — create application
  await sql`
    INSERT INTO membership_applications (user_id, org_id, reason, mode, sponsors_needed)
    VALUES (${session.sub}, ${id}, ${body.reason || null}, ${org.enrollment_mode}, ${org.sponsors_required})
  `;

  return ok({
    status: "application_submitted",
    mode: org.enrollment_mode,
    sponsorsNeeded: org.sponsors_required,
  }, 201);
}
