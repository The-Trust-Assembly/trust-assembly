import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, err, unauthorized, forbidden, notFound } from "@/lib/api-utils";
import { isValidUUID } from "@/lib/validation";
import { createNotification } from "@/lib/notifications";
import { isWildWestMode, getJurySize, JURY_POOL_MULTIPLIER } from "@/lib/jury-rules";

// POST /api/disputes/[id]/takeover — original submitter takes over a third-party dispute
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  const { id } = await params;
  if (!isValidUUID(id)) return notFound("Not found");

  // Fetch the dispute
  const dispute = await sql`
    SELECT id, submission_id, org_id, disputed_by, original_submitter, status, grace_period_until
    FROM disputes WHERE id = ${id}
  `;
  if (dispute.rows.length === 0) return notFound("Dispute not found");

  const d = dispute.rows[0];

  // Only the original submitter can take over
  if (session.sub !== d.original_submitter) return forbidden("Only the original submitter can take over this dispute");

  // Must be in grace period
  if (d.status !== "grace_period") return err("This dispute is not in the grace period");

  // Check grace period hasn't expired
  if (d.grace_period_until && new Date(d.grace_period_until) < new Date()) {
    return err("The 48-hour grace period has expired");
  }

  // Take over: update disputed_by to the original submitter, set status to pending_review
  await sql`
    UPDATE disputes
    SET disputed_by = ${session.sub}, status = 'pending_review',
        taken_over_by = ${session.sub}, taken_over_at = now(),
        grace_period_until = NULL
    WHERE id = ${id}
  `;

  // Audit log
  await sql`
    INSERT INTO audit_log (action, user_id, org_id, entity_type, entity_id)
    VALUES ('Dispute taken over by original submitter', ${session.sub}, ${d.org_id}, 'dispute', ${id})
  `;

  // Notify the original third-party filer
  createNotification({
    userId: d.disputed_by as string,
    type: "dispute_filed",
    title: "The original submitter has taken over your dispute",
    body: "Your evidence has been preserved. The original submitter will now lead this dispute.",
    entityType: "dispute",
    entityId: id,
  }).catch(() => {});

  // Now assign jury (same logic as in dispute creation)
  try {
    const wildWest = await isWildWestMode();
    const memberCount = await sql`SELECT COUNT(*) as count FROM organization_members WHERE org_id = ${d.org_id} AND is_active = TRUE`;
    const count = parseInt(memberCount.rows[0].count);
    const jurySize = wildWest ? 1 : getJurySize(count);
    const poolSize = jurySize * JURY_POOL_MULTIPLIER;

    const pool = await sql.query(
      `SELECT om.user_id FROM organization_members om
       JOIN users u ON u.id = om.user_id
       WHERE om.org_id = $1 AND om.is_active = TRUE AND u.is_di = FALSE
         AND om.user_id != $2 AND om.user_id != $3
       ORDER BY RANDOM() LIMIT $4`,
      [d.org_id, session.sub, d.disputed_by, poolSize]
    );

    for (const juror of pool.rows) {
      await sql.query(
        `INSERT INTO jury_assignments (dispute_id, user_id, role, in_pool, accepted, accepted_at)
         VALUES ($1, $2, 'dispute', TRUE, TRUE, now())
         ON CONFLICT DO NOTHING`,
        [id, juror.user_id]
      );
      createNotification({ userId: juror.user_id as string, type: "dispute_jury_assigned", title: "You've been assigned to a dispute jury.", body: "A submission dispute is ready for your review.", entityType: "dispute", entityId: id }).catch(() => {});
    }
  } catch (e) {
    console.error("Takeover jury assignment failed:", e);
  }

  return ok({ success: true, takenOver: true });
}
