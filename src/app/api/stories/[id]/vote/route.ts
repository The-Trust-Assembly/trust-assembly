import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, err, unauthorized, notFound, forbidden } from "@/lib/api-utils";
import { tryResolveStory } from "@/lib/vote-resolution";
import { isWildWestMode } from "@/lib/jury-rules";
import { validateFields, MAX_LENGTHS } from "@/lib/validation";

// POST /api/stories/[id]/vote — cast a jury vote on a story proposal
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  const { id } = await params;
  const body = await request.json();
  const { approve, note, role } = body;

  if (typeof approve !== "boolean") {
    return err("approve (boolean) is required");
  }

  const noteError = validateFields([["note", note, MAX_LENGTHS.vote_note]]);
  if (noteError) return err(noteError);

  const juryRole = role || "in_group";

  // Verify story exists and is reviewable
  const story = await sql`
    SELECT id, status, submitted_by, org_id FROM stories WHERE id = ${id}
  `;
  if (story.rows.length === 0) return notFound("Story not found");

  const validStatuses = ["pending_review", "cross_review"];
  if (!validStatuses.includes(story.rows[0].status)) {
    return err("Story is not currently under review");
  }

  // Can't vote on own story
  if (story.rows[0].submitted_by === session.sub) {
    return forbidden("Cannot vote on your own story proposal");
  }

  const wildWest = await isWildWestMode();

  if (wildWest) {
    // Wild West: any member of the story's org can vote
    const membership = await sql`
      SELECT id FROM organization_members
      WHERE org_id = ${story.rows[0].org_id} AND user_id = ${session.sub} AND is_active = TRUE
    `;
    if (membership.rows.length === 0) {
      return forbidden("You must be a member of this assembly to vote");
    }
  } else {
    // Normal mode: verify user is an assigned juror for this story
    const assignment = await sql`
      SELECT id FROM jury_assignments
      WHERE story_id = ${id} AND user_id = ${session.sub}
      AND role = ${juryRole} AND accepted = TRUE
    `;
    if (assignment.rows.length === 0) {
      return forbidden("You are not an assigned juror for this story");
    }
  }

  // Check if already voted
  const existingVote = await sql`
    SELECT id FROM jury_votes
    WHERE story_id = ${id} AND user_id = ${session.sub} AND role = ${juryRole}
  `;
  if (existingVote.rows.length > 0) {
    return err("You have already voted on this story", 409);
  }

  // Atomic vote insertion
  const client = await sql.connect();
  try {
    await client.query("BEGIN");

    // Lock the story row
    await client.query("SELECT id FROM stories WHERE id = $1 FOR UPDATE", [id]);

    // Re-check duplicate inside transaction
    const dupeCheck = await client.query(
      "SELECT id FROM jury_votes WHERE story_id = $1 AND user_id = $2 AND role = $3",
      [id, session.sub, juryRole]
    );
    if (dupeCheck.rows.length > 0) {
      await client.query("ROLLBACK");
      return err("You have already voted on this story", 409);
    }

    // Cast vote (simplified: no ratings, no deliberate_lie)
    await client.query(
      `INSERT INTO jury_votes (story_id, user_id, role, approve, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, session.sub, juryRole, approve, note || null]
    );

    // Audit log
    await client.query(
      "INSERT INTO audit_log (action, user_id, entity_type, entity_id) VALUES ($1, $2, $3, $4)",
      ["Story vote cast", session.sub, "story", id]
    );

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  // Resolution runs outside the vote transaction
  let resolution: { resolved: boolean; outcome?: string; promotedToCrossGroup?: boolean } = { resolved: false };
  try {
    resolution = await tryResolveStory(id, juryRole);
  } catch (e) {
    console.error(`Story resolution failed for ${id} after vote was committed:`, e);
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
