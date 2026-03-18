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
    LEFT JOIN users u ON u.id = s.submitted_by
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
    // Use sql.connect() for a dedicated client where transactions work.
    const client = await sql.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "UPDATE submissions SET status = 'rejected', resolved_at = $1 WHERE id = $2",
        [now, id]
      );
      await client.query(
        "INSERT INTO audit_log (action, user_id, org_id, entity_type, entity_id, metadata) VALUES ($1, $2, $3, $4, $5, $6)",
        [
          "DI submission rejected by partner (pre-review)",
          session.sub, sub.org_id, "submission", id,
          JSON.stringify({ partnerUsername: session.username, action: "reject" }),
        ]
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      console.error("DI reject transaction failed, rolled back:", e);
      throw e;
    } finally {
      client.release();
    }
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

  // Use sql.connect() for a dedicated client where transactions work.
  const approveClient = await sql.connect();
  try {
    await approveClient.query("BEGIN");

    if (hasEnough) {
      // Assign jury
      const jurySize = wildWest ? 1 : getJurySize(count);
      const poolSize = jurySize * JURY_POOL_MULTIPLIER;

      await approveClient.query(
        "UPDATE submissions SET jury_seats = $1 WHERE id = $2",
        [jurySize, id]
      );

      const pool = await approveClient.query(
        `SELECT om.user_id
         FROM organization_members om
         JOIN users u ON u.id = om.user_id
         WHERE om.org_id = $1
           AND om.is_active = TRUE
           AND u.is_di = FALSE
           AND om.user_id != $2
           AND om.user_id != $3
         ORDER BY RANDOM()
         LIMIT $4`,
        [sub.org_id, sub.submitted_by, session.sub, poolSize]
      );

      if (pool.rows.length > 0) {
        for (const juror of pool.rows) {
          await approveClient.query(
            `INSERT INTO jury_assignments (submission_id, user_id, role, in_pool, accepted)
             VALUES ($1, $2, 'in_group', TRUE, FALSE)
             ON CONFLICT DO NOTHING`,
            [id, juror.user_id]
          );
        }
        newStatus = "pending_review";
      }
    }

    await approveClient.query(
      "UPDATE submissions SET status = $1 WHERE id = $2",
      [newStatus, id]
    );

    await approveClient.query(
      "INSERT INTO audit_log (action, user_id, org_id, entity_type, entity_id, metadata) VALUES ($1, $2, $3, $4, $5, $6)",
      [
        `DI submission approved by partner — status: ${newStatus}`,
        session.sub, sub.org_id, "submission", id,
        JSON.stringify({ partnerUsername: session.username, action: "approve", newStatus, memberCount: count }),
      ]
    );

    await approveClient.query("COMMIT");
  } catch (e) {
    await approveClient.query("ROLLBACK");
    console.error("DI approve transaction failed, rolled back:", e);
    throw e;
  } finally {
    approveClient.release();
  }

  return ok({ id, status: newStatus, action: "approved", juryAssigned: newStatus === "pending_review" });
}
