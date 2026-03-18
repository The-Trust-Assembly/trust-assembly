import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, err, unauthorized, notFound, forbidden } from "@/lib/api-utils";
import { TRUSTED_STREAK } from "@/lib/jury-rules";

// POST /api/stories/[id]/tag — tag a submission to a story
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  const { id } = await params;
  const body = await request.json();
  const { submissionId } = body;

  if (!submissionId) return err("submissionId is required");

  // Verify story exists and is approved or consensus
  const story = await sql`SELECT id, status, org_id, submitted_by FROM stories WHERE id = ${id}`;
  if (story.rows.length === 0) return notFound("Story not found");

  const storyStatus = story.rows[0].status;
  if (!["approved", "consensus", "cross_review"].includes(storyStatus)) {
    return err("Can only tag submissions to approved or consensus stories");
  }

  // Verify submission exists
  const submission = await sql`SELECT id, org_id FROM submissions WHERE id = ${submissionId}`;
  if (submission.rows.length === 0) return notFound("Submission not found");

  // Org check: approved stories only accept same-org submissions; consensus accepts any
  if (storyStatus === "approved" || storyStatus === "cross_review") {
    if (submission.rows[0].org_id !== story.rows[0].org_id) {
      return err("Only submissions from the same assembly can be tagged to this story until it reaches consensus");
    }
  }

  // Verify tagger is an active member of at least one relevant org
  const storyOrgMembership = await sql`
    SELECT id FROM organization_members
    WHERE org_id = ${story.rows[0].org_id} AND user_id = ${session.sub} AND is_active = TRUE
  `;
  const subOrgMembership = await sql`
    SELECT id FROM organization_members
    WHERE org_id = ${submission.rows[0].org_id} AND user_id = ${session.sub} AND is_active = TRUE
  `;
  if (storyOrgMembership.rows.length === 0 && subOrgMembership.rows.length === 0) {
    return forbidden("You must be a member of either the story's or the submission's assembly to tag");
  }

  // Check trusted status for auto-approval
  const user = await sql`SELECT current_streak FROM users WHERE id = ${session.sub}`;
  const isTrusted = user.rows[0].current_streak >= TRUSTED_STREAK;

  const tagStatus = isTrusted ? "approved" : "pending";

  // Insert tag (ON CONFLICT DO NOTHING for idempotency)
  const result = await sql`
    INSERT INTO story_submissions (story_id, submission_id, tagged_by, status, approved_by, approved_at)
    VALUES (${id}, ${submissionId}, ${session.sub},
            ${tagStatus},
            ${isTrusted ? session.sub : null},
            ${isTrusted ? new Date().toISOString() : null})
    ON CONFLICT (story_id, submission_id) DO NOTHING
    RETURNING id, status
  `;

  if (result.rows.length === 0) {
    return ok({ message: "Submission is already tagged to this story" });
  }

  // Audit log
  await sql`
    INSERT INTO audit_log (action, user_id, org_id, entity_type, entity_id, metadata)
    VALUES (${`Submission tagged to story${isTrusted ? " (trusted auto-approved)" : ""}`},
            ${session.sub}, ${story.rows[0].org_id}, 'story', ${id},
            ${JSON.stringify({ submissionId, tagStatus })})
  `;

  return ok({ id: result.rows[0].id, status: result.rows[0].status }, 201);
}

// PATCH /api/stories/[id]/tag — approve a pending tag
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  const { id } = await params;
  const body = await request.json();
  const { submissionId } = body;

  if (!submissionId) return err("submissionId is required");

  // Verify story exists
  const story = await sql`SELECT id, org_id FROM stories WHERE id = ${id}`;
  if (story.rows.length === 0) return notFound("Story not found");

  // Verify approver is an active org member
  const membership = await sql`
    SELECT id FROM organization_members
    WHERE org_id = ${story.rows[0].org_id} AND user_id = ${session.sub} AND is_active = TRUE
  `;
  if (membership.rows.length === 0) {
    return forbidden("You must be a member of this assembly to approve tags");
  }

  // Approve the pending tag
  const result = await sql`
    UPDATE story_submissions
    SET status = 'approved', approved_by = ${session.sub}, approved_at = now()
    WHERE story_id = ${id} AND submission_id = ${submissionId} AND status = 'pending'
    RETURNING id
  `;

  if (result.rows.length === 0) {
    return err("No pending tag found for this submission");
  }

  return ok({ approved: true });
}

// DELETE /api/stories/[id]/tag — remove a tag
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  const { id } = await params;
  const body = await request.json();
  const { submissionId } = body;

  if (!submissionId) return err("submissionId is required");

  // Verify story exists
  const story = await sql`SELECT id, submitted_by, org_id FROM stories WHERE id = ${id}`;
  if (story.rows.length === 0) return notFound("Story not found");

  // Only the tagger, story creator, or admin can untag
  const tag = await sql`
    SELECT id, tagged_by FROM story_submissions
    WHERE story_id = ${id} AND submission_id = ${submissionId}
  `;
  if (tag.rows.length === 0) return notFound("Tag not found");

  const isCreator = story.rows[0].submitted_by === session.sub;
  const isTagger = tag.rows[0].tagged_by === session.sub;

  if (!isCreator && !isTagger) {
    return forbidden("Only the tagger or story creator can remove this tag");
  }

  await sql`
    DELETE FROM story_submissions WHERE story_id = ${id} AND submission_id = ${submissionId}
  `;

  return ok({ removed: true });
}
