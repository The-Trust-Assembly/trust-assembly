import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, err, unauthorized, notFound } from "@/lib/api-utils";
import { isValidUUID } from "@/lib/validation";

// PATCH /api/di-requests/[id] — approve or reject a DI request
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  const { id } = await params;
  if (!isValidUUID(id)) return notFound("Not found");
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

  // Use sql.connect() for a dedicated client where transactions work.
  // The sql`` tagged template (neon HTTP driver) is stateless — each call
  // goes to a different connection, so multi-step writes can partially fail
  // (e.g. DI request approved but user linkage incomplete).
  const client = await sql.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      "UPDATE di_requests SET status = $1 WHERE id = $2",
      [newStatus, id]
    );

    // If approved, update both users' DI fields atomically
    if (action === "approve") {
      const diUserId = diReq.rows[0].di_user_id;
      const partnerUserId = diReq.rows[0].partner_user_id;

      // Enforce 5-DI-per-human limit
      const approvedCount = await client.query(
        "SELECT COUNT(*)::int AS cnt FROM di_requests WHERE partner_user_id = $1 AND status = 'approved'",
        [partnerUserId]
      );
      if (approvedCount.rows[0].cnt >= 5) {
        await client.query("ROLLBACK");
        client.release();
        return err("This partner already has 5 approved DI partnerships (maximum)", 409);
      }

      // DI user → human partner (each DI has exactly one partner)
      await client.query(
        "UPDATE users SET is_di = TRUE, di_partner_id = $1, di_approved = TRUE WHERE id = $2",
        [partnerUserId, diUserId]
      );
      // Human partner → DI: set di_partner_id only if NULL (first DI).
      // With multiple DIs, the human's di_partner_id holds the first approved DI;
      // the full list is derived from di_requests WHERE status='approved'.
      await client.query(
        "UPDATE users SET di_partner_id = $1 WHERE id = $2 AND di_partner_id IS NULL",
        [diUserId, partnerUserId]
      );
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("DI partnership transaction failed, rolled back:", e);
    throw e;
  } finally {
    client.release();
  }

  return ok({ id, status: newStatus });
}
