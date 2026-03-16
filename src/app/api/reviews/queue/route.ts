import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/api-utils";

// GET /api/reviews/queue — returns all review items for the current user
// from the relational DB.  The v5 SPA merges these into its KV-loaded state
// so nothing from the relational tables falls through the cracks.
//
// Returns:
//   submissions  – pending_review/cross_review where user is assigned juror and hasn't voted
//   disputes     – pending_review where user is assigned juror and hasn't voted
//   myDisputes   – all disputes filed by user or against user's submissions

export async function GET(request: NextRequest) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  // ── In-group & cross-group submissions assigned to user ──
  const subsResult = await sql`
    SELECT
      s.id, s.submission_type, s.status, s.url, s.original_headline,
      s.replacement, s.reasoning, s.author, s.trusted_skip,
      s.is_di, s.di_partner_id, s.jury_seats, s.jury_seed,
      s.cross_group_jury_size, s.cross_group_seed,
      s.deliberate_lie_finding, s.survival_count,
      s.created_at, s.resolved_at,
      u.username AS submitted_by_username,
      o.id AS org_id,
      o.name AS org_name,
      ja.role AS jury_role,
      ja.accepted AS jury_accepted,
      ja.accepted_at AS jury_accepted_at,
      partner.username AS di_partner_username
    FROM jury_assignments ja
    JOIN submissions s ON s.id = ja.submission_id
    JOIN users u ON u.id = s.submitted_by
    JOIN organizations o ON o.id = s.org_id
    LEFT JOIN users partner ON partner.id = s.di_partner_id
    WHERE ja.user_id = ${session.sub}
      AND s.status IN ('pending_review', 'cross_review')
      AND NOT EXISTS (
        SELECT 1 FROM jury_votes jv
        WHERE jv.submission_id = s.id
          AND jv.user_id = ${session.sub}
          AND jv.role = ja.role
      )
    ORDER BY s.created_at DESC
  `;

  // Collect submission IDs for batch-loading evidence, edits, jurors, votes
  const subIds = subsResult.rows.map((r: Record<string, unknown>) => r.id as string);

  // ── Batch load evidence ──
  let evidenceMap: Record<string, Array<Record<string, unknown>>> = {};
  if (subIds.length > 0) {
    const ev = await sql.query(
      `SELECT submission_id, url, explanation, sort_order
       FROM submission_evidence WHERE submission_id = ANY($1)
       ORDER BY sort_order`,
      [subIds]
    );
    for (const row of ev.rows) {
      if (!evidenceMap[row.submission_id]) evidenceMap[row.submission_id] = [];
      evidenceMap[row.submission_id].push(row);
    }
  }

  // ── Batch load inline edits ──
  let editsMap: Record<string, Array<Record<string, unknown>>> = {};
  if (subIds.length > 0) {
    const edits = await sql.query(
      `SELECT submission_id, original_text, replacement_text, reasoning, sort_order, approved
       FROM submission_inline_edits WHERE submission_id = ANY($1)
       ORDER BY sort_order`,
      [subIds]
    );
    for (const row of edits.rows) {
      if (!editsMap[row.submission_id]) editsMap[row.submission_id] = [];
      editsMap[row.submission_id].push(row);
    }
  }

  // ── Batch load jury assignments (all jurors per submission) ──
  let jurorsMap: Record<string, Array<Record<string, unknown>>> = {};
  if (subIds.length > 0) {
    const jurors = await sql.query(
      `SELECT ja.submission_id, ja.role, ja.accepted, ja.accepted_at, u.username
       FROM jury_assignments ja
       JOIN users u ON u.id = ja.user_id
       WHERE ja.submission_id = ANY($1)
       ORDER BY ja.assigned_at`,
      [subIds]
    );
    for (const row of jurors.rows) {
      if (!jurorsMap[row.submission_id]) jurorsMap[row.submission_id] = [];
      jurorsMap[row.submission_id].push(row);
    }
  }

  // ── Batch load existing votes (to compute counts) ──
  let votesMap: Record<string, Array<Record<string, unknown>>> = {};
  if (subIds.length > 0) {
    const votes = await sql.query(
      `SELECT jv.submission_id, jv.role, jv.approve, jv.note,
              jv.deliberate_lie, jv.newsworthy, jv.interesting, jv.voted_at,
              u.username
       FROM jury_votes jv
       JOIN users u ON u.id = jv.user_id
       WHERE jv.submission_id = ANY($1)
       ORDER BY jv.voted_at`,
      [subIds]
    );
    for (const row of votes.rows) {
      if (!votesMap[row.submission_id]) votesMap[row.submission_id] = [];
      votesMap[row.submission_id].push(row);
    }
  }

  // ── Batch load linked vault entries ──
  let linkedMap: Record<string, Array<Record<string, unknown>>> = {};
  if (subIds.length > 0) {
    const linked = await sql.query(
      `SELECT submission_id, entry_type, entry_id, label, detail
       FROM submission_linked_entries WHERE submission_id = ANY($1)`,
      [subIds]
    );
    for (const row of linked.rows) {
      if (!linkedMap[row.submission_id]) linkedMap[row.submission_id] = [];
      linkedMap[row.submission_id].push(row);
    }
  }

  // Transform to the shape the v5 front-end expects
  const submissions = subsResult.rows.map((row: Record<string, unknown>) => {
    const id = row.id as string;
    const allJurors = jurorsMap[id] || [];
    const inGroupJurors = allJurors.filter(j => j.role === "in_group").map(j => j.username as string);
    const crossGroupJurors = allJurors.filter(j => j.role === "cross_group").map(j => j.username as string);
    const acceptedInGroup = allJurors.filter(j => j.role === "in_group" && j.accepted).map(j => j.username as string);
    const acceptedCrossGroup = allJurors.filter(j => j.role === "cross_group" && j.accepted).map(j => j.username as string);

    const allVotes = votesMap[id] || [];
    const inGroupVotes: Record<string, Record<string, unknown>> = {};
    const crossGroupVotes: Record<string, Record<string, unknown>> = {};
    for (const v of allVotes) {
      const voteObj = {
        approve: v.approve, note: v.note, time: v.voted_at,
        newsworthy: v.newsworthy, interesting: v.interesting,
        deliberateLie: v.deliberate_lie,
      };
      if (v.role === "cross_group") {
        crossGroupVotes[v.username as string] = voteObj;
      } else {
        inGroupVotes[v.username as string] = voteObj;
      }
    }

    return {
      id,
      submissionType: row.submission_type,
      status: row.status,
      url: row.url,
      originalHeadline: row.original_headline,
      replacement: row.replacement,
      reasoning: row.reasoning,
      author: row.author,
      trustedSkip: row.trusted_skip,
      isDI: row.is_di,
      diPartner: row.di_partner_username,
      diPartnerId: row.di_partner_id,
      jurySeats: row.jury_seats,
      jurySeed: row.jury_seed,
      crossGroupJurySize: row.cross_group_jury_size,
      crossGroupSeed: row.cross_group_seed,
      deliberateLieFinding: row.deliberate_lie_finding,
      survivalCount: row.survival_count,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
      submittedBy: row.submitted_by_username,
      orgId: row.org_id,
      orgName: row.org_name,
      evidence: (evidenceMap[id] || []).map(e => ({
        url: e.url, explanation: e.explanation,
      })),
      inlineEdits: (editsMap[id] || []).map(e => ({
        original: e.original_text, replacement: e.replacement_text,
        reasoning: e.reasoning, approved: e.approved,
      })),
      linkedVaultEntries: (linkedMap[id] || []).map(e => ({
        id: e.entry_id, type: e.entry_type, label: e.label, detail: e.detail,
      })),
      jurors: inGroupJurors,
      acceptedJurors: acceptedInGroup,
      acceptedAt: Object.fromEntries(
        allJurors.filter(j => j.role === "in_group" && j.accepted_at)
          .map(j => [j.username, j.accepted_at])
      ),
      votes: inGroupVotes,
      crossGroupJurors,
      crossGroupAcceptedJurors: acceptedCrossGroup,
      crossGroupAcceptedAt: Object.fromEntries(
        allJurors.filter(j => j.role === "cross_group" && j.accepted_at)
          .map(j => [j.username, j.accepted_at])
      ),
      crossGroupVotes,
      anonMap: {},
      auditTrail: [{
        time: row.created_at,
        action: `Submission received. Jury assigned.`,
      }],
      _fromRelational: true,
    };
  });

  // ── Disputes where user is juror and hasn't voted ──
  const disputesResult = await sql`
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
    FROM jury_assignments ja
    JOIN disputes d ON d.id = ja.dispute_id
    JOIN submissions s ON s.id = d.submission_id
    JOIN users disputer ON disputer.id = d.disputed_by
    JOIN users orig_user ON orig_user.id = s.submitted_by
    JOIN organizations o ON o.id = d.org_id
    WHERE ja.user_id = ${session.sub}
      AND d.status = 'pending_review'
      AND NOT EXISTS (
        SELECT 1 FROM jury_votes jv
        WHERE jv.dispute_id = d.id AND jv.user_id = ${session.sub}
      )
    ORDER BY d.created_at DESC
  `;

  // Batch load dispute jurors and votes
  const disputeIds = disputesResult.rows.map((r: Record<string, unknown>) => r.id as string);
  let disputeJurorsMap: Record<string, string[]> = {};
  let disputeVotesMap: Record<string, Record<string, Record<string, unknown>>> = {};

  if (disputeIds.length > 0) {
    const dJurors = await sql.query(
      `SELECT ja.dispute_id, u.username
       FROM jury_assignments ja
       JOIN users u ON u.id = ja.user_id
       WHERE ja.dispute_id = ANY($1)
       ORDER BY ja.assigned_at`,
      [disputeIds]
    );
    for (const row of dJurors.rows) {
      if (!disputeJurorsMap[row.dispute_id]) disputeJurorsMap[row.dispute_id] = [];
      disputeJurorsMap[row.dispute_id].push(row.username);
    }

    const dVotes = await sql.query(
      `SELECT jv.dispute_id, jv.approve, jv.note, jv.deliberate_lie, jv.voted_at,
              u.username
       FROM jury_votes jv
       JOIN users u ON u.id = jv.user_id
       WHERE jv.dispute_id = ANY($1)
       ORDER BY jv.voted_at`,
      [disputeIds]
    );
    for (const row of dVotes.rows) {
      if (!disputeVotesMap[row.dispute_id]) disputeVotesMap[row.dispute_id] = {};
      disputeVotesMap[row.dispute_id][row.username] = {
        approve: row.approve, note: row.note,
        deliberateLie: row.deliberate_lie, time: row.voted_at,
      };
    }
  }

  // Batch load dispute evidence
  let disputeEvidenceMap: Record<string, Array<Record<string, unknown>>> = {};
  if (disputeIds.length > 0) {
    const dEvidence = await sql.query(
      `SELECT dispute_id, url, explanation, sort_order
       FROM dispute_evidence WHERE dispute_id = ANY($1)
       ORDER BY sort_order`,
      [disputeIds]
    );
    for (const row of dEvidence.rows) {
      if (!disputeEvidenceMap[row.dispute_id]) disputeEvidenceMap[row.dispute_id] = [];
      disputeEvidenceMap[row.dispute_id].push(row);
    }
  }

  const disputes = disputesResult.rows.map((row: Record<string, unknown>) => {
    const id = row.id as string;
    return {
      id,
      subId: row.submission_id,
      orgId: row.org_id,
      orgName: row.org_name,
      reasoning: row.reasoning,
      status: row.status,
      deliberateLieFinding: row.deliberate_lie_finding,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
      disputedBy: row.disputed_by,
      originalSubmitter: row.original_submitter,
      submissionHeadline: row.submission_headline,
      submissionReasoning: row.submission_reasoning,
      submissionReplacement: row.submission_replacement,
      submissionUrl: row.submission_url,
      jurors: disputeJurorsMap[id] || [],
      votes: disputeVotesMap[id] || {},
      evidence: (disputeEvidenceMap[id] || []).map(e => ({
        url: e.url, explanation: e.explanation,
      })),
      anonMap: {},
      auditTrail: [{
        time: row.created_at,
        action: `Dispute filed. Jury assigned.`,
      }],
      _fromRelational: true,
    };
  });

  // ── My disputes (user is disputer or original submitter) ──
  const myDisputesResult = await sql`
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
    JOIN submissions s ON s.id = d.submission_id
    JOIN users disputer ON disputer.id = d.disputed_by
    JOIN users orig_user ON orig_user.id = s.submitted_by
    JOIN organizations o ON o.id = d.org_id
    WHERE d.disputed_by = ${session.sub}
       OR s.submitted_by = ${session.sub}
    ORDER BY d.created_at DESC
  `;

  // Batch load my-dispute jurors and votes
  const myDisputeIds = myDisputesResult.rows.map((r: Record<string, unknown>) => r.id as string);
  let myDisputeJurorsMap: Record<string, string[]> = {};
  let myDisputeVotesMap: Record<string, Record<string, Record<string, unknown>>> = {};

  if (myDisputeIds.length > 0) {
    const mdJurors = await sql.query(
      `SELECT ja.dispute_id, u.username
       FROM jury_assignments ja
       JOIN users u ON u.id = ja.user_id
       WHERE ja.dispute_id = ANY($1)
       ORDER BY ja.assigned_at`,
      [myDisputeIds]
    );
    for (const row of mdJurors.rows) {
      if (!myDisputeJurorsMap[row.dispute_id]) myDisputeJurorsMap[row.dispute_id] = [];
      myDisputeJurorsMap[row.dispute_id].push(row.username);
    }

    const mdVotes = await sql.query(
      `SELECT jv.dispute_id, jv.approve, jv.note, jv.deliberate_lie, jv.voted_at,
              u.username
       FROM jury_votes jv
       JOIN users u ON u.id = jv.user_id
       WHERE jv.dispute_id = ANY($1)
       ORDER BY jv.voted_at`,
      [myDisputeIds]
    );
    for (const row of mdVotes.rows) {
      if (!myDisputeVotesMap[row.dispute_id]) myDisputeVotesMap[row.dispute_id] = {};
      myDisputeVotesMap[row.dispute_id][row.username] = {
        approve: row.approve, note: row.note,
        deliberateLie: row.deliberate_lie, time: row.voted_at,
      };
    }
  }

  const myDisputes = myDisputesResult.rows.map((row: Record<string, unknown>) => {
    const id = row.id as string;
    return {
      id,
      subId: row.submission_id,
      orgId: row.org_id,
      orgName: row.org_name,
      reasoning: row.reasoning,
      status: row.status,
      deliberateLieFinding: row.deliberate_lie_finding,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
      disputedBy: row.disputed_by,
      originalSubmitter: row.original_submitter,
      submissionHeadline: row.submission_headline,
      submissionReasoning: row.submission_reasoning,
      submissionReplacement: row.submission_replacement,
      submissionUrl: row.submission_url,
      jurors: myDisputeJurorsMap[id] || [],
      votes: myDisputeVotesMap[id] || {},
      anonMap: {},
      auditTrail: [{
        time: row.created_at,
        action: `Dispute filed.`,
      }],
      _fromRelational: true,
    };
  });

  return ok({ submissions, disputes, myDisputes });
}
