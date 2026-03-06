import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ok, err, unauthorized, forbidden } from "@/lib/api-utils";

// GET /api/orgs/[id]/applications — list applications for an org (founder only)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentUser();
  if (!session) return unauthorized();

  const { id } = await params;

  // Check that user is founder
  const founder = await sql`
    SELECT id FROM organization_members
    WHERE org_id = ${id} AND user_id = ${session.sub} AND is_founder = TRUE AND is_active = TRUE
  `;
  if (founder.rows.length === 0) {
    return forbidden("Only founders can view applications");
  }

  const result = await sql`
    SELECT
      ma.id, ma.user_id, ma.reason, ma.link, ma.mode,
      ma.sponsors_needed, ma.founder_approved, ma.status, ma.created_at,
      u.username, u.display_name
    FROM membership_applications ma
    JOIN users u ON u.id = ma.user_id
    WHERE ma.org_id = ${id}
    ORDER BY ma.created_at DESC
  `;

  return ok({ applications: result.rows });
}

// POST /api/orgs/[id]/applications — apply to join an org
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentUser();
  if (!session) return unauthorized();

  const { id } = await params;
  const body = await request.json();
  const { reason, link } = body;

  // Get org enrollment mode
  const org = await sql`
    SELECT id, enrollment_mode, sponsors_required FROM organizations WHERE id = ${id}
  `;
  if (org.rows.length === 0) {
    return err("Organization not found", 404);
  }

  // Check if already a member
  const existing = await sql`
    SELECT id FROM organization_members
    WHERE org_id = ${id} AND user_id = ${session.sub} AND is_active = TRUE
  `;
  if (existing.rows.length > 0) {
    return err("You are already a member of this assembly", 409);
  }

  // Check for existing pending application
  const pendingApp = await sql`
    SELECT id FROM membership_applications
    WHERE org_id = ${id} AND user_id = ${session.sub} AND status = 'pending'
  `;
  if (pendingApp.rows.length > 0) {
    return err("You already have a pending application", 409);
  }

  const result = await sql`
    INSERT INTO membership_applications (user_id, org_id, reason, link, mode, sponsors_needed)
    VALUES (${session.sub}, ${id}, ${reason || null}, ${link || null},
            ${org.rows[0].enrollment_mode}, ${org.rows[0].sponsors_required})
    RETURNING id, user_id, org_id, status, created_at
  `;

  return ok(result.rows[0], 201);
}
