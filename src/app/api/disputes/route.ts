import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-utils";
import { validateFields, MAX_LENGTHS } from "@/lib/validation";

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
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  const body = await request.json();
  const { submissionId, reasoning, evidence } = body;

  if (!submissionId || !reasoning) {
    return err("submissionId and reasoning are required");
  }

  const lengthError = validateFields([
    ["reasoning", reasoning, MAX_LENGTHS.reasoning],
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

  // Look up submission to get org_id and original submitter
  const sub = await sql`
    SELECT id, org_id, submitted_by FROM submissions WHERE id = ${submissionId}
  `;
  if (sub.rows.length === 0) {
    return err("Submission not found", 404);
  }

  const { org_id, submitted_by } = sub.rows[0];

  // Use sql.connect() for a dedicated client where transactions work.
  const client = await sql.connect();
  let dispute: Record<string, unknown>;

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `INSERT INTO disputes (submission_id, org_id, disputed_by, original_submitter, reasoning)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, submission_id, org_id, status, created_at`,
      [submissionId, org_id, session.sub, submitted_by, reasoning]
    );
    dispute = result.rows[0];

    // Insert evidence if provided
    if (evidence && Array.isArray(evidence)) {
      for (let i = 0; i < evidence.length; i++) {
        const e = evidence[i];
        if (e.url && e.explanation) {
          await client.query(
            "INSERT INTO dispute_evidence (dispute_id, url, explanation, sort_order) VALUES ($1, $2, $3, $4)",
            [dispute.id, e.url, e.explanation, i]
          );
        }
      }
    }

    // Audit log
    await client.query(
      "INSERT INTO audit_log (action, user_id, org_id, entity_type, entity_id) VALUES ($1, $2, $3, $4, $5)",
      ["Dispute filed", session.sub, org_id, "dispute", dispute.id]
    );

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Dispute creation transaction failed, rolled back:", e);
    throw e;
  } finally {
    client.release();
  }

  return ok(dispute, 201);
}
