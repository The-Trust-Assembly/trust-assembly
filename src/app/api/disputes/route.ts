import { NextRequest } from "next/server";
import { sql, withTransaction } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-utils";
import { validateFields, MAX_LENGTHS } from "@/lib/validation";
import { logError } from "@/lib/error-logger";
import { createNotification } from "@/lib/notifications";
import { isWildWestMode, getJurySize, JURY_POOL_MULTIPLIER } from "@/lib/jury-rules";

const SOURCE_FILE = "src/app/api/disputes/route.ts";

// GET /api/disputes — list disputes (filterable)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId");
  const submissionId = searchParams.get("submissionId");
  const status = searchParams.get("status");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
  const offset = parseInt(searchParams.get("offset") || "0");

  let query = `
    SELECT
      d.id, d.submission_id, d.org_id, d.reasoning, d.status,
      d.deliberate_lie_finding, d.created_at, d.resolved_at,
      d.dispute_type, d.field_responses,
      u.username AS disputed_by_username, u.display_name AS disputed_by_display_name
    FROM disputes d
    LEFT JOIN users u ON u.id = d.disputed_by
    WHERE 1=1
  `;
  const params: unknown[] = [];
  let paramIndex = 1;

  if (orgId) {
    query += ` AND d.org_id = $${paramIndex++}`;
    params.push(orgId);
  }
  if (submissionId) {
    query += ` AND d.submission_id = $${paramIndex++}`;
    params.push(submissionId);
  }
  if (status) {
    query += ` AND d.status = $${paramIndex++}`;
    params.push(status);
  }

  query += ` ORDER BY d.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(limit, offset);

  const result = await sql.query(query, params);

  const disputes = result.rows.map((row: Record<string, unknown>) => ({
    ...row,
    disputed_by_username: row.disputed_by_username || "unknown",
    disputed_by_display_name: row.disputed_by_display_name || "",
  }));

  return ok({
    disputes,
    limit,
    offset,
  });
}

// POST /api/disputes — create a dispute
export async function POST(request: NextRequest) {
  const requestUrl = request.url;
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return err("Invalid JSON body");
  }

  const { submissionId, reasoning, evidence, fieldResponses, disputeType } = body as Record<string, unknown>;

  if (!submissionId || !reasoning) {
    return err("submissionId and reasoning are required");
  }

  const lengthError = validateFields([
    ["reasoning", reasoning as string, MAX_LENGTHS.reasoning],
  ]);
  if (lengthError) return err(lengthError);

  if (evidence && Array.isArray(evidence)) {
    for (const e of evidence) {
      const evError = validateFields([
        ["evidence url", e.url, MAX_LENGTHS.evidence_url],
        ["evidence explanation", e.explanation, MAX_LENGTHS.evidence_explanation],
      ]);
      if (evError) return err(evError);
    }
  }

  // Look up submission to get org_id, original submitter, and status
  const sub = await sql`
    SELECT id, org_id, submitted_by, status FROM submissions WHERE id = ${submissionId as string}
  `;
  if (sub.rows.length === 0) {
    return err("Submission not found", 404);
  }

  const { org_id, submitted_by, status: subStatus } = sub.rows[0];

  // Validate dispute is on a resolved submission
  const validDisputeStatuses = ["approved", "consensus", "rejected", "consensus_rejected"];
  if (!validDisputeStatuses.includes(subStatus as string)) {
    return err("Can only dispute submissions that have been approved or rejected");
  }

  // Determine dispute type from body or infer from submission status
  const resolvedType = (disputeType as string) || (subStatus === "rejected" || subStatus === "consensus_rejected" ? "challenge_rejection" : "challenge_approval");

  let dispute: Record<string, unknown>;

  try {
    dispute = await withTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO disputes (submission_id, org_id, disputed_by, original_submitter, reasoning, dispute_type, field_responses)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, submission_id, org_id, status, dispute_type, created_at`,
        [submissionId, org_id, session.sub, submitted_by, reasoning, resolvedType,
         fieldResponses ? JSON.stringify(fieldResponses) : null]
      );
      const d = result.rows[0];

      // Update dispute tracking on submissions table
      await client.query(
        `UPDATE submissions
         SET dispute_count = dispute_count + 1,
             first_disputed_at = COALESCE(first_disputed_at, now()),
             last_disputed_at = now()
         WHERE id = $1`,
        [submissionId]
      );

      // Insert evidence if provided
      if (evidence && Array.isArray(evidence)) {
        for (let i = 0; i < evidence.length; i++) {
          const e = evidence[i];
          if (e.url && e.explanation) {
            await client.query(
              "INSERT INTO dispute_evidence (dispute_id, url, explanation, sort_order) VALUES ($1, $2, $3, $4)",
              [d.id, e.url, e.explanation, i]
            );
          }
        }
      }

      // Audit log
      await client.query(
        "INSERT INTO audit_log (action, user_id, org_id, entity_type, entity_id) VALUES ($1, $2, $3, $4, $5)",
        ["Dispute filed", session.sub, org_id, "dispute", d.id]
      );

      return d;
    });
  } catch (error) {
    await logError({
      userId: session.sub,
      sessionInfo: session.username,
      errorType: "transaction_error",
      error: error instanceof Error ? error : String(error),
      apiRoute: "/api/disputes",
      sourceFile: SOURCE_FILE,
      sourceFunction: "POST handler",
      lineContext: "Dispute creation transaction (INSERT dispute → INSERT evidence → INSERT audit_log)",
      entityType: "dispute",
      entityId: submissionId as string,
      httpMethod: "POST",
      httpStatus: 500,
      requestUrl,
      requestBody: { submissionId, disputeType: resolvedType },
    });
    return err("Failed to create dispute. Please try again.", 500);
  }

  // Notify the original submitter about the dispute (fire-and-forget)
  await createNotification({
    userId: submitted_by as string,
    type: "dispute_filed",
    title: "Your submission has been disputed",
    body: `A ${resolvedType === "challenge_rejection" ? "challenge to rejection" : "challenge to approval"} was filed`,
    entityType: "dispute",
    entityId: dispute.id as string,
  });

  // ── Assign jury to the dispute ──
  try {
    const wildWest = await isWildWestMode();
    const memberCount = await sql`SELECT COUNT(*) as count FROM organization_members WHERE org_id = ${org_id} AND is_active = TRUE`;
    const count = parseInt(memberCount.rows[0].count);
    const jurySize = wildWest ? 1 : getJurySize(count);
    const poolSize = jurySize * JURY_POOL_MULTIPLIER;

    const pool = await sql.query(
      `SELECT om.user_id FROM organization_members om
       JOIN users u ON u.id = om.user_id
       WHERE om.org_id = $1 AND om.is_active = TRUE AND u.is_di = FALSE
         AND om.user_id != $2 AND om.user_id != $3
       ORDER BY RANDOM() LIMIT $4`,
      [org_id, session.sub, submitted_by, poolSize]
    );

    for (const juror of pool.rows) {
      await sql.query(
        `INSERT INTO jury_assignments (dispute_id, user_id, role, in_pool, accepted, accepted_at)
         VALUES ($1, $2, 'dispute', TRUE, TRUE, now())
         ON CONFLICT DO NOTHING`,
        [dispute.id, juror.user_id]
      );
      createNotification({ userId: juror.user_id as string, type: "dispute_jury_assigned", title: "You've been assigned to a dispute jury.", body: "A submission dispute is ready for your review.", entityType: "dispute", entityId: dispute.id as string }).catch(() => {});
    }

    await sql`INSERT INTO audit_log (action, user_id, org_id, entity_type, entity_id, metadata)
      VALUES ('Dispute jury assigned', ${session.sub}, ${org_id}, 'dispute', ${dispute.id},
        ${JSON.stringify({ jurySize, poolSize: pool.rows.length, wildWest })}::jsonb)`;
  } catch (juryError) {
    console.error("Dispute jury assignment failed:", juryError);
  }

  return ok(dispute, 201);
}
