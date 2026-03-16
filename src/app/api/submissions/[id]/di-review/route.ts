import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, err, unauthorized, forbidden, notFound } from "@/lib/api-utils";
import { isWildWestMode, getJurySize, JURY_POOL_MULTIPLIER } from "@/lib/jury-rules";

// POST /api/submissions/[id]/di-review — DI partner pre-approval or rejection
// Body: { action: "approve" | "reject" }

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  const { id } = await params;
  const body = await request.json();
  const { action } = body;

  if (!action || !["approve", "reject"].includes(action)) {
    return err("action must be 'approve' or 'reject'");
  }

  // Load the submission
  const subResult = await sql`
    SELECT s.*, u.username AS submitted_by_username
    FROM submissions s
    JOIN users u ON u.id = s.submitted_by
    WHERE s.id = ${id}
  `;
  if (subResult.rows.length === 0) return notFound("Submission not found");

  const sub = subResult.rows[0];

  // Verify it's di_pending
  if (sub.status !== "di_pending") {
    return err(`Submission status is '${sub.status}', not 'di_pending'`);
  }

  // Verify the current user is the DI partner
  if (sub.di_partner_id !== session.sub) {
    return forbidden("Only the DI partner can pre-approve this submission");
  }

  const now = new Date().toISOString();

  if (action === "reject") {
    await sql`
      UPDATE submissions SET status = 'rejected', resolved_at = ${now}
      WHERE id = ${id}
    `;
    await sql`
      INSERT INTO audit_log (action, user_id, org_id, entity_type, entity_id, metadata)
      VALUES (
        'DI submission rejected by partner (pre-review)',
        ${session.sub}, ${sub.org_id}, 'submission', ${id},
        ${JSON.stringify({ partnerUsername: session.username, action: "reject" })}
      )
    `;
    return ok({ id, status: "rejected", action: "rejected" });
  }

  // action === "approve"
  const wildWest = await isWildWestMode();

  // Check assembly member count
  const memberCount = await sql`
    SELECT COUNT(*) as count FROM organization_members
    WHERE org_id = ${sub.org_id} AND is_active = TRUE
  `;
  const count = parseInt(memberCount.rows[0].count);
  const hasEnough = wildWest ? count >= 2 : count >= 5;

  let newStatus = "pending_jury";

  if (hasEnough) {
    // Assign jury
    const jurySize = wildWest ? 1 : getJurySize(count);
    const poolSize = jurySize * JURY_POOL_MULTIPLIER;

    await sql`
      UPDATE submissions SET jury_seats = ${jurySize} WHERE id = ${id}
    `;

    const pool = await sql`
      SELECT om.user_id
      FROM organization_members om
      WHERE om.org_id = ${sub.org_id}
        AND om.is_active = TRUE
        AND om.user_id != ${sub.submitted_by}
        AND om.user_id != ${session.sub}
      ORDER BY RANDOM()
      LIMIT ${poolSize}
    `;

    if (pool.rows.length > 0) {
      for (const juror of pool.rows) {
        await sql`
          INSERT INTO jury_assignments (submission_id, user_id, role, in_pool, accepted)
          VALUES (${id}, ${juror.user_id}, 'in_group', TRUE, FALSE)
          ON CONFLICT DO NOTHING
        `;
      }
      newStatus = "pending_review";
    }
  }

  await sql`
    UPDATE submissions SET status = ${newStatus} WHERE id = ${id}
  `;

  await sql`
    INSERT INTO audit_log (action, user_id, org_id, entity_type, entity_id, metadata)
    VALUES (
      ${`DI submission approved by partner — status: ${newStatus}`},
      ${session.sub}, ${sub.org_id}, 'submission', ${id},
      ${JSON.stringify({ partnerUsername: session.username, action: "approve", newStatus, memberCount: count })}
    )
  `;

  return ok({ id, status: newStatus, action: "approved", juryAssigned: newStatus === "pending_review" });
}
