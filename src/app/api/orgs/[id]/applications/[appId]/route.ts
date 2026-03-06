import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ok, err, unauthorized, forbidden } from "@/lib/api-utils";

// PATCH /api/orgs/[id]/applications/[appId] — approve or reject an application
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; appId: string }> }
) {
  const session = await getCurrentUser();
  if (!session) return unauthorized();

  const { id, appId } = await params;
  const body = await request.json();
  const { action } = body;

  if (!action || !["approve", "reject"].includes(action)) {
    return err("action must be 'approve' or 'reject'");
  }

  // Check that user is founder
  const founder = await sql`
    SELECT id FROM organization_members
    WHERE org_id = ${id} AND user_id = ${session.sub} AND is_founder = TRUE AND is_active = TRUE
  `;
  if (founder.rows.length === 0) {
    return forbidden("Only founders can manage applications");
  }

  // Get application
  const app = await sql`
    SELECT id, user_id, status FROM membership_applications
    WHERE id = ${appId} AND org_id = ${id}
  `;
  if (app.rows.length === 0) {
    return err("Application not found", 404);
  }
  if (app.rows[0].status !== "pending") {
    return err("Application has already been processed");
  }

  const newStatus = action === "approve" ? "approved" : "rejected";

  await sql`
    UPDATE membership_applications
    SET status = ${newStatus}, founder_approved = ${action === "approve"}
    WHERE id = ${appId}
  `;

  // If approved, add user to organization members
  if (action === "approve") {
    await sql`
      INSERT INTO organization_members (org_id, user_id)
      VALUES (${id}, ${app.rows[0].user_id})
      ON CONFLICT (org_id, user_id) DO UPDATE SET is_active = TRUE, left_at = NULL
    `;

    await sql`
      INSERT INTO organization_member_history (org_id, user_id, action)
      VALUES (${id}, ${app.rows[0].user_id}, 'joined')
    `;
  }

  return ok({ id: appId, status: newStatus });
}
