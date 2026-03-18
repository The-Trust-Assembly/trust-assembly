import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, err, unauthorized, forbidden } from "@/lib/api-utils";

// POST /api/disputes/[id]/vote — vote on a dispute
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  const { id } = await params;
  const body = await request.json();
  const { approve, note, deliberateLie } = body;

  if (typeof approve !== "boolean") {
    return err("approve (boolean) is required");
  }

  // Verify dispute exists and is open for voting
  const dispute = await sql`
    SELECT id, org_id, status, filed_by FROM disputes WHERE id = ${id}
  `;
  if (dispute.rows.length === 0) {
    return err("Dispute not found", 404);
  }
  if (dispute.rows[0].status !== "pending_review") {
    return err("Dispute is not currently under review");
  }

  // Can't vote on own dispute
  if (dispute.rows[0].filed_by === session.sub) {
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

  // Use sql.connect() for a dedicated client where transactions work.
  const client = await sql.connect();
  let vote: Record<string, unknown>;

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `INSERT INTO jury_votes (dispute_id, user_id, role, approve, note, deliberate_lie)
       VALUES ($1, $2, 'dispute', $3, $4, $5)
       RETURNING id, dispute_id, approve, voted_at`,
      [id, session.sub, approve, note || null, deliberateLie || false]
    );
    vote = result.rows[0];

    await client.query(
      "INSERT INTO audit_log (action, user_id, org_id, entity_type, entity_id) VALUES ($1, $2, $3, $4, $5)",
      ["Dispute vote cast", session.sub, dispute.rows[0].org_id, "dispute", id]
    );

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Dispute vote transaction failed, rolled back:", e);
    throw e;
  } finally {
    client.release();
  }

  return ok(vote, 201);
}
