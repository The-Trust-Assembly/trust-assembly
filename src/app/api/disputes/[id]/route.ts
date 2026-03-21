import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { ok, err, notFound } from "@/lib/api-utils";
import { isValidUUID } from "@/lib/validation";

// GET /api/disputes/[id] — get dispute details with evidence and votes
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) return notFound("Not found");

  // Get dispute with disputed_by user info
  const disputeResult = await sql`
    SELECT
      d.id, d.submission_id, d.org_id, d.reasoning, d.status,
      d.deliberate_lie_finding, d.created_at, d.resolved_at,
      d.dispute_type, d.field_responses,
      u.username AS disputed_by_username, u.display_name AS disputed_by_display_name,
      ou.username AS original_submitter_username
    FROM disputes d
    LEFT JOIN users u ON u.id = d.disputed_by
    LEFT JOIN users ou ON ou.id = d.original_submitter
    WHERE d.id = ${id}
  `;

  if (disputeResult.rows.length === 0) {
    return err("Dispute not found", 404);
  }

  const dispute = disputeResult.rows[0];

  // Get evidence
  const evidence = await sql`
    SELECT id, url, explanation, sort_order
    FROM dispute_evidence
    WHERE dispute_id = ${id}
    ORDER BY sort_order ASC
  `;

  // Get jury assignments
  const juryAssignments = await sql`
    SELECT ja.id, ja.user_id, ja.role, ja.in_pool, ja.accepted, ja.accepted_at, ja.assigned_at,
           u.username, u.display_name
    FROM jury_assignments ja
    LEFT JOIN users u ON u.id = ja.user_id
    WHERE ja.dispute_id = ${id}
    ORDER BY ja.assigned_at ASC
  `;

  // Get votes
  const votes = await sql`
    SELECT jv.id, jv.user_id, jv.role, jv.approve, jv.note, jv.deliberate_lie, jv.voted_at,
           u.username, u.display_name
    FROM jury_votes jv
    LEFT JOIN users u ON u.id = jv.user_id
    WHERE jv.dispute_id = ${id}
    ORDER BY jv.voted_at ASC
  `;

  return ok({
    ...dispute,
    disputed_by_username: dispute.disputed_by_username || "unknown",
    disputed_by_display_name: dispute.disputed_by_display_name || "",
    original_submitter_username: dispute.original_submitter_username || "unknown",
    evidence: evidence.rows,
    juryAssignments: juryAssignments.rows.map((j: Record<string, unknown>) => ({
      ...j,
      username: j.username || "unknown",
      display_name: j.display_name || "",
    })),
    votes: votes.rows.map((v: Record<string, unknown>) => ({
      ...v,
      username: v.username || "unknown",
    })),
  });
}
