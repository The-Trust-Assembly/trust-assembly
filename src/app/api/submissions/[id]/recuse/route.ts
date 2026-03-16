import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, err, unauthorized, notFound } from "@/lib/api-utils";

// POST /api/submissions/[id]/recuse — juror recuses from a submission
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  const { id } = await params;

  // Check submission exists and is pending review
  const sub = await sql`
    SELECT id, status, submitted_by, org_id FROM submissions WHERE id = ${id}
  `;
  if (sub.rows.length === 0) return notFound("Submission not found");

  const status = sub.rows[0].status as string;
  if (!["pending_review", "cross_review"].includes(status)) {
    return err("Cannot recuse from a submission that is not under review");
  }

  const isCross = status === "cross_review";
  const role = isCross ? "cross_group" : "in_group";

  // Check that user is assigned to this jury
  const assignment = await sql`
    SELECT id FROM jury_assignments
    WHERE submission_id = ${id} AND user_id = ${session.sub} AND role = ${role}
  `;
  if (assignment.rows.length === 0) {
    return err("You are not on this jury");
  }

  // Check that user hasn't already voted
  const existingVote = await sql`
    SELECT id FROM jury_votes
    WHERE submission_id = ${id} AND user_id = ${session.sub} AND role = ${role}
  `;
  if (existingVote.rows.length > 0) {
    return err("Already voted — cannot recuse");
  }

  // Remove jury assignment
  await sql`
    DELETE FROM jury_assignments
    WHERE submission_id = ${id} AND user_id = ${session.sub} AND role = ${role}
  `;

  // Audit log
  await sql`
    INSERT INTO audit_log (action, user_id, org_id, entity_type, entity_id)
    VALUES (
      'Juror recused from submission',
      ${session.sub}, ${sub.rows[0].org_id}, 'submission', ${id}
    )
  `;

  return ok({ success: true });
}
