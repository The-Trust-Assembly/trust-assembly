import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, err, unauthorized, notFound, forbidden } from "@/lib/api-utils";
import { tryResolveSubmission } from "@/lib/vote-resolution";
import { isWildWestMode } from "@/lib/jury-rules";
import { validateFields, MAX_LENGTHS } from "@/lib/validation";

// POST /api/submissions/[id]/vote — cast a jury vote
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  const { id } = await params;
  const body = await request.json();
  const { approve, note, deliberateLie, newsworthy, interesting, role } = body;

  if (typeof approve !== "boolean") {
    return err("approve (boolean) is required");
  }

  const noteError = validateFields([["note", note, MAX_LENGTHS.vote_note]]);
  if (noteError) return err(noteError);

  const juryRole = role || "in_group";

  // Verify submission exists and is reviewable
  const sub = await sql`
    SELECT id, status, submitted_by, org_id, is_di, di_partner_id FROM submissions WHERE id = ${id}
  `;
  if (sub.rows.length === 0) return notFound("Submission not found");

  const validStatuses = ["pending_review", "cross_review"];
  if (!validStatuses.includes(sub.rows[0].status)) {
    return err("Submission is not currently under review");
  }

  // Can't vote on own submission
  if (sub.rows[0].submitted_by === session.sub) {
    return forbidden("Cannot vote on your own submission");
  }

  // Can't vote if you're the DI partner of the submitter
  if (sub.rows[0].di_partner_id === session.sub) {
    return forbidden("Cannot vote on a submission from your DI partner");
  }

  const wildWest = await isWildWestMode();

  if (wildWest) {
    // Wild West: any member of the submission's org can vote
    // (except submitter/DI-connected, checked above)
    const membership = await sql`
      SELECT id FROM organization_members
      WHERE org_id = ${sub.rows[0].org_id} AND user_id = ${session.sub} AND is_active = TRUE
    `;
    if (membership.rows.length === 0) {
      return forbidden("You must be a member of this assembly to vote");
    }
  } else {
    // Normal mode: verify user is an accepted juror for this submission
    const assignment = await sql`
      SELECT id FROM jury_assignments
      WHERE submission_id = ${id} AND user_id = ${session.sub}
      AND role = ${juryRole} AND accepted = TRUE
    `;
    if (assignment.rows.length === 0) {
      return forbidden("You are not an assigned juror for this submission");
    }
  }

  // Check if already voted (pre-transaction fast check)
  const existingVote = await sql`
    SELECT id FROM jury_votes
    WHERE submission_id = ${id} AND user_id = ${session.sub} AND role = ${juryRole}
  `;
  if (existingVote.rows.length > 0) {
    return err("You have already voted on this submission", 409);
  }

  // Validate ratings
  if (newsworthy !== undefined && (newsworthy < 1 || newsworthy > 10)) {
    return err("newsworthy must be between 1 and 10");
  }
  if (interesting !== undefined && (interesting < 1 || interesting > 10)) {
    return err("interesting must be between 1 and 10");
  }

  // ── Atomic vote insertion ──
  // Use sql.connect() for a dedicated client where transactions actually work.
  // The sql`` tagged template uses the neon HTTP driver (stateless), where
  // BEGIN/COMMIT/ROLLBACK are no-ops across separate calls.
  let resolution: { resolved: boolean; outcome?: string; promotedToCrossGroup?: boolean };

  const client = await sql.connect();
  try {
    await client.query("BEGIN");

    // Lock the submission row to serialize concurrent votes
    await client.query("SELECT id FROM submissions WHERE id = $1 FOR UPDATE", [id]);

    // Re-check for duplicate vote inside the transaction (race condition guard)
    const dupeCheck = await client.query(
      "SELECT id FROM jury_votes WHERE submission_id = $1 AND user_id = $2 AND role = $3",
      [id, session.sub, juryRole]
    );
    if (dupeCheck.rows.length > 0) {
      await client.query("ROLLBACK");
      return err("You have already voted on this submission", 409);
    }

    // Cast vote
    await client.query(
      `INSERT INTO jury_votes (
        submission_id, user_id, role, approve, note,
        deliberate_lie, newsworthy, interesting
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, session.sub, juryRole, approve, note || null,
       deliberateLie || false, newsworthy || null, interesting || null]
    );

    // Audit log
    await client.query(
      "INSERT INTO audit_log (action, user_id, entity_type, entity_id) VALUES ($1, $2, $3, $4)",
      ["Vote cast", session.sub, "submission", id]
    );

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  // Resolution runs outside the vote transaction — it acquires its own
  // dedicated client internally via sql.connect(). This ensures the vote
  // is committed and visible before resolution checks vote counts.
  // Wrapped in try/catch: the vote is already committed, so resolution
  // failure must not return a 500 (which would show "Vote failed" to the user).
  try {
    resolution = await tryResolveSubmission(id, juryRole);
  } catch (e) {
    console.error(`Resolution failed for submission ${id} after vote was committed:`, e);
    // Vote was saved — return success. Resolution can be retried via admin tools.
  }

  return ok({
    status: resolution.resolved ? "resolved" : "voted",
    approve,
    resolution: resolution.resolved ? {
      outcome: resolution.outcome,
      promotedToCrossGroup: resolution.promotedToCrossGroup,
    } : undefined,
  });
}
