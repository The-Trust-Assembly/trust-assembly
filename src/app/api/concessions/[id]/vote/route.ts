import { NextRequest } from "next/server";
import { sql, withTransaction } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, err, unauthorized, forbidden, notFound, serverError } from "@/lib/api-utils";
import { isValidUUID } from "@/lib/validation";

// POST /api/concessions/[id]/vote — vote on a concession
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  const { id } = await params;
  if (!isValidUUID(id)) return notFound("Not found");
  const body = await request.json();
  const { approve } = body;

  if (typeof approve !== "boolean") {
    return err("approve (boolean) is required");
  }

  // Verify concession exists and is open for voting
  const concession = await sql`
    SELECT id, org_id, status, proposed_by FROM concessions WHERE id = ${id}
  `;
  if (concession.rows.length === 0) {
    return err("Concession not found", 404);
  }
  if (concession.rows[0].status !== "pending_review") {
    return err("Concession is not currently open for voting");
  }

  // Can't vote on own concession
  if (concession.rows[0].proposed_by === session.sub) {
    return forbidden("Cannot vote on your own concession");
  }

  // Check if already voted
  const existingVote = await sql`
    SELECT id FROM jury_votes
    WHERE concession_id = ${id} AND user_id = ${session.sub}
  `;
  if (existingVote.rows.length > 0) {
    return err("You have already voted on this concession", 409);
  }

  try {
    const vote = await withTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO jury_votes (concession_id, user_id, role, approve)
         VALUES ($1, $2, 'concession', $3)
         RETURNING id, concession_id, approve, voted_at`,
        [id, session.sub, approve]
      );

      await client.query(
        "INSERT INTO audit_log (action, user_id, org_id, entity_type, entity_id) VALUES ($1, $2, $3, $4, $5)",
        ["Concession vote cast", session.sub, concession.rows[0].org_id, "concession", id]
      );

      return result.rows[0];
    });

    return ok(vote, 201);
  } catch (e) {
    return serverError("POST /api/concessions/[id]/vote", e);
  }
}
