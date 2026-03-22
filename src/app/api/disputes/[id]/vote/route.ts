import { NextRequest } from "next/server";
import { sql, withTransaction } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, err, unauthorized, forbidden, notFound, serverError } from "@/lib/api-utils";
import { isValidUUID } from "@/lib/validation";

// POST /api/disputes/[id]/vote — vote on a dispute
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  const { id } = await params;
  if (!isValidUUID(id)) return notFound("Not found");
  const body = await request.json();
  const { approve, note, deliberateLie } = body;

  if (typeof approve !== "boolean") {
    return err("approve (boolean) is required");
  }

  // Verify dispute exists and is open for voting
  const dispute = await sql`
    SELECT id, org_id, status, disputed_by FROM disputes WHERE id = ${id}
  `;
  if (dispute.rows.length === 0) {
    return err("Dispute not found", 404);
  }
  if (dispute.rows[0].status !== "pending_review") {
    return err("Dispute is not currently under review");
  }

  // Can't vote on own dispute
  if (dispute.rows[0].disputed_by === session.sub) {
    return forbidden("Cannot vote on your own dispute");
  }

  // Check if already voted
  const existingVote = await sql`
    SELECT id FROM jury_votes
    WHERE dispute_id = ${id} AND user_id = ${session.sub}
  `;
  if (existingVote.rows.length > 0) {
    return err("You have already voted on this dispute", 409);
  }

  try {
    const vote = await withTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO jury_votes (dispute_id, user_id, role, approve, note, deliberate_lie)
         VALUES ($1, $2, 'dispute', $3, $4, $5)
         RETURNING id, dispute_id, approve, voted_at`,
        [id, session.sub, approve, note || null, deliberateLie || false]
      );

      await client.query(
        "INSERT INTO audit_log (action, user_id, org_id, entity_type, entity_id) VALUES ($1, $2, $3, $4, $5)",
        ["Dispute vote cast", session.sub, dispute.rows[0].org_id, "dispute", id]
      );

      return result.rows[0];
    });

    return ok(vote, 201);
  } catch (e) {
    return serverError("POST /api/disputes/[id]/vote", e);
  }
}
