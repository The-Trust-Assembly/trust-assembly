import { NextRequest } from "next/server";
import { sql, withTransaction } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, err, unauthorized, forbidden, notFound, serverError } from "@/lib/api-utils";
import { isValidUUID } from "@/lib/validation";

// PATCH /api/orgs/[id]/applications/[appId] — approve or reject an application
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; appId: string }> }
) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  const { id, appId } = await params;
  if (!isValidUUID(id) || !isValidUUID(appId)) return notFound("Not found");
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

  try {
    await withTransaction(async (client) => {
      await client.query(
        "UPDATE membership_applications SET status = $1, founder_approved = $2 WHERE id = $3",
        [newStatus, action === "approve", appId]
      );

      // If approved, add user to organization members atomically
      if (action === "approve") {
        await client.query(
          `INSERT INTO organization_members (org_id, user_id)
           VALUES ($1, $2)
           ON CONFLICT (org_id, user_id) DO UPDATE SET is_active = TRUE, left_at = NULL`,
          [id, app.rows[0].user_id]
        );

        await client.query(
          "INSERT INTO organization_member_history (org_id, user_id, action) VALUES ($1, $2, $3)",
          [id, app.rows[0].user_id, "joined"]
        );
      }
    });
  } catch (e) {
    return serverError("/api/orgs/[id]/applications/[appId]", e);
  }

  return ok({ id: appId, status: newStatus });
}
