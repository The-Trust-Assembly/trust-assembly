import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-utils";

// PATCH /api/di-requests/[id] — approve or reject a DI request
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentUser();
  if (!session) return unauthorized();

  const { id } = await params;
  const body = await request.json();
  const { action } = body;

  if (!action || !["approve", "reject"].includes(action)) {
    return err("action must be 'approve' or 'reject'");
  }

  // Get the DI request (only the partner can action it)
  const diReq = await sql`
    SELECT id, di_user_id, partner_user_id, status
    FROM di_requests WHERE id = ${id}
  `;
  if (diReq.rows.length === 0) {
    return err("DI request not found", 404);
  }

  if (diReq.rows[0].partner_user_id !== session.sub) {
    return err("Only the partner can approve or reject this request", 403);
  }

  if (diReq.rows[0].status !== "pending") {
    return err("This request has already been processed");
  }

  const newStatus = action === "approve" ? "approved" : "rejected";

  await sql`
    UPDATE di_requests SET status = ${newStatus} WHERE id = ${id}
  `;

  // If approved, update both users' DI fields
  if (action === "approve") {
    const diUserId = diReq.rows[0].di_user_id;
    const partnerUserId = diReq.rows[0].partner_user_id;

    await sql`
      UPDATE users SET is_di = TRUE, di_partner_id = ${partnerUserId}, di_approved = TRUE
      WHERE id = ${diUserId}
    `;
    await sql`
      UPDATE users SET di_partner_id = ${diUserId}
      WHERE id = ${partnerUserId}
    `;
  }

  return ok({ id, status: newStatus });
}
