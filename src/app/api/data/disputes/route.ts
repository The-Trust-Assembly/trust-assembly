import { sql } from "@/lib/db";
import { ok, serverError } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

// GET /api/data/disputes — returns ALL disputes keyed by ID
// in the format the v5 SPA expects.
// This replaces sG(SK.DISPUTES) reads from the deprecated KV store.
export async function GET() {
  try {
  const result = await sql`
    SELECT
      d.id, d.submission_id, d.org_id, d.reasoning, d.status,
      d.deliberate_lie_finding, d.created_at, d.resolved_at,
      disputer.username AS disputed_by,
      orig_user.username AS original_submitter,
      s.original_headline AS submission_headline,
      s.reasoning AS submission_reasoning,
      s.replacement AS submission_replacement,
      s.url AS submission_url,
      o.name AS org_name
    FROM disputes d
    LEFT JOIN submissions s ON s.id = d.submission_id
    LEFT JOIN users disputer ON disputer.id = d.disputed_by
    LEFT JOIN users orig_user ON orig_user.id = s.submitted_by
    LEFT JOIN organizations o ON o.id = d.org_id
    ORDER BY d.created_at DESC
  `;

  const disputeIds = result.rows.map((r: Record<string, unknown>) => r.id as string);
  if (disputeIds.length === 0) return ok({});

  // Batch load jurors
  const jurors = await sql.query(
    `SELECT ja.dispute_id, u.username
     FROM jury_assignments ja
     LEFT JOIN users u ON u.id = ja.user_id
     WHERE ja.dispute_id = ANY($1)
     ORDER BY ja.assigned_at`,
    [disputeIds]
  );
  const jurorsMap: Record<string, string[]> = {};
  for (const row of jurors.rows) {
    if (!jurorsMap[row.dispute_id]) jurorsMap[row.dispute_id] = [];
    jurorsMap[row.dispute_id].push(row.username);
  }

  // Batch load votes
  const votes = await sql.query(
    `SELECT jv.dispute_id, jv.approve, jv.note, jv.deliberate_lie, jv.voted_at,
            u.username
     FROM jury_votes jv
     LEFT JOIN users u ON u.id = jv.user_id
     WHERE jv.dispute_id = ANY($1)
     ORDER BY jv.voted_at`,
    [disputeIds]
  );
  const votesMap: Record<string, Record<string, Record<string, unknown>>> = {};
  for (const row of votes.rows) {
    if (!votesMap[row.dispute_id]) votesMap[row.dispute_id] = {};
    votesMap[row.dispute_id][row.username] = {
      approve: row.approve, note: row.note,
      deliberateLie: row.deliberate_lie, time: row.voted_at,
    };
  }

  // Batch load evidence
  const evidence = await sql.query(
    `SELECT dispute_id, url, explanation, sort_order
     FROM dispute_evidence WHERE dispute_id = ANY($1)
     ORDER BY sort_order`,
    [disputeIds]
  );
  const evidenceMap: Record<string, Array<Record<string, unknown>>> = {};
  for (const row of evidence.rows) {
    if (!evidenceMap[row.dispute_id]) evidenceMap[row.dispute_id] = [];
    evidenceMap[row.dispute_id].push(row);
  }

  const disputes: Record<string, unknown> = {};
  for (const row of result.rows) {
    const id = row.id as string;
    disputes[id] = {
      id,
      subId: row.submission_id,
      orgId: row.org_id,
      orgName: row.org_name || "Unknown Org",
      reasoning: row.reasoning,
      status: row.status,
      deliberateLieFinding: row.deliberate_lie_finding,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
      disputedBy: row.disputed_by || "unknown",
      originalSubmitter: row.original_submitter || "unknown",
      submissionHeadline: row.submission_headline,
      submissionReasoning: row.submission_reasoning,
      submissionReplacement: row.submission_replacement,
      submissionUrl: row.submission_url,
      jurors: jurorsMap[id] || [],
      votes: votesMap[id] || {},
      evidence: (evidenceMap[id] || []).map(e => ({
        url: e.url, explanation: e.explanation,
      })),
      anonMap: {},
      auditTrail: [],
    };
  }

  return ok(disputes);
  } catch (error) {
    return serverError("GET /api/data/disputes", error);
  }
}
