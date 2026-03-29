// Shared dispute jury assignment logic.
// Used by POST /api/disputes (new disputes) and POST /api/admin/process-records (backfill).

import { sql } from "@/lib/db";
import {
  getSuperJurySize,
  JURY_POOL_MULTIPLIER,
  isWildWestMode,
} from "@/lib/jury-rules";

interface AssignDisputeJuryParams {
  disputeId: string;
  submissionId: string;
  orgId: string;
  disputerId: string;
  originalSubmitterId: string;
}

interface AssignDisputeJuryResult {
  jurySize: number;
  assigned: number;
  jurorUserIds: string[];
}

export async function assignDisputeJury(
  params: AssignDisputeJuryParams
): Promise<AssignDisputeJuryResult> {
  const { disputeId, submissionId, orgId, disputerId, originalSubmitterId } = params;

  const wildWest = await isWildWestMode();

  // Get org member count
  const memberCountResult = await sql`
    SELECT COUNT(*)::int AS count FROM organization_members
    WHERE org_id = ${orgId} AND is_active = TRUE
  `;
  const memberCount = memberCountResult.rows[0].count as number;

  const jurySize = wildWest ? 1 : getSuperJurySize(memberCount);
  const poolSize = wildWest ? memberCount : jurySize * JURY_POOL_MULTIPLIER;

  // Look up DI partner IDs for both disputer and original submitter
  const partners = await sql`
    SELECT id, di_partner_id FROM users WHERE id IN (${disputerId}, ${originalSubmitterId})
  `;
  const disputerPartner = partners.rows.find(
    (r: Record<string, unknown>) => r.id === disputerId
  )?.di_partner_id as string | null;
  const submitterPartner = partners.rows.find(
    (r: Record<string, unknown>) => r.id === originalSubmitterId
  )?.di_partner_id as string | null;

  // Draw random jury pool excluding: disputer, original submitter, their DI partners,
  // DI accounts, and all original jurors who voted on the submission
  const pool = await sql.query(
    `SELECT om.user_id
     FROM organization_members om
     JOIN users u ON u.id = om.user_id
     WHERE om.org_id = $1
       AND om.is_active = TRUE
       AND u.is_di = FALSE
       AND om.user_id != $2
       AND om.user_id != $3
       AND ($4::uuid IS NULL OR om.user_id != $4)
       AND ($5::uuid IS NULL OR om.user_id != $5)
       AND om.user_id NOT IN (
         SELECT DISTINCT jv.user_id FROM jury_votes jv
         WHERE jv.submission_id = $6
           AND jv.role IN ('in_group', 'cross_group')
       )
     ORDER BY RANDOM()
     LIMIT $7`,
    [orgId, disputerId, originalSubmitterId, disputerPartner, submitterPartner, submissionId, poolSize]
  );

  if (pool.rows.length === 0) {
    return { jurySize, assigned: 0, jurorUserIds: [] };
  }

  // Insert jury assignments in a transaction
  const client = await sql.connect();
  try {
    await client.query("BEGIN");

    for (const juror of pool.rows) {
      await client.query(
        `INSERT INTO jury_assignments (dispute_id, user_id, role, in_pool, accepted)
         VALUES ($1, $2, 'in_group', TRUE, FALSE)
         ON CONFLICT DO NOTHING`,
        [disputeId, juror.user_id]
      );
    }

    // Store jury size on the dispute for display purposes
    await client.query(
      `UPDATE disputes SET jury_seats = $1 WHERE id = $2`,
      [jurySize, disputeId]
    );

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  const jurorUserIds = pool.rows.map((r: Record<string, unknown>) => r.user_id as string);
  return { jurySize, assigned: jurorUserIds.length, jurorUserIds };
}
