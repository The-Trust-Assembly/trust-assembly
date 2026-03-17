import { sql } from "@/lib/db";
import { ok } from "@/lib/api-utils";
import { isWildWestMode, getJurySize, JURY_POOL_MULTIPLIER } from "@/lib/jury-rules";

export const dynamic = "force-dynamic";

// GET /api/data/submissions — returns ALL submissions keyed by ID
// in the format the v5 SPA expects (camelCase, nested votes/jurors/evidence).
// This replaces sG(SK.SUBS) reads from the deprecated KV store.
export async function GET() {
  // ── Auto-promote pending_jury → pending_review ──
  // Submissions stuck in pending_jury because the org was too small at creation
  // time should be promoted when the org now has enough members.
  const wildWest = await isWildWestMode();
  const threshold = wildWest ? 2 : 5;

  const stuckSubs = await sql`
    SELECT s.id, s.org_id, s.submitted_by, s.di_partner_id
    FROM submissions s
    WHERE s.status = 'pending_jury'
  `;

  for (const sub of stuckSubs.rows) {
    const memberCount = await sql`
      SELECT COUNT(*) as count FROM organization_members
      WHERE org_id = ${sub.org_id} AND is_active = TRUE
    `;
    const count = parseInt(memberCount.rows[0].count);
    if (count >= threshold) {
      // Org now has enough members — promote and assign jury
      const jurySize = wildWest ? 1 : getJurySize(count);
      const poolSize = jurySize * JURY_POOL_MULTIPLIER;

      // Build exclusion list: submitter + DI partner
      const excluded = [sub.submitted_by];
      if (sub.di_partner_id) excluded.push(sub.di_partner_id);

      const pool = await sql.query(
        `SELECT om.user_id
         FROM organization_members om
         WHERE om.org_id = $1
           AND om.is_active = TRUE
           AND om.user_id != ALL($2::uuid[])
         ORDER BY RANDOM()
         LIMIT $3`,
        [sub.org_id, excluded, poolSize]
      );

      for (const juror of pool.rows) {
        await sql`
          INSERT INTO jury_assignments (submission_id, user_id, role, in_pool, accepted)
          VALUES (${sub.id}, ${juror.user_id}, 'in_group', TRUE, FALSE)
          ON CONFLICT DO NOTHING
        `;
      }

      await sql`
        UPDATE submissions SET status = 'pending_review', jury_seats = ${jurySize}
        WHERE id = ${sub.id}
      `;

      await sql`
        INSERT INTO audit_log (action, org_id, entity_type, entity_id, metadata)
        VALUES ('Submission promoted from pending_jury to pending_review (auto)', ${sub.org_id}, 'submission', ${sub.id},
                ${JSON.stringify({ memberCount: count, jurySize, wildWest })})
      `;
    }
  }

  const result = await sql`
    SELECT
      s.id, s.submission_type, s.status, s.url, s.normalized_url,
      s.original_headline, s.replacement, s.reasoning, s.author,
      s.trusted_skip, s.is_di, s.jury_seats, s.jury_seed,
      s.internal_jury_size, s.cross_group_jury_size, s.cross_group_seed,
      s.deliberate_lie_finding, s.survival_count,
      s.created_at, s.resolved_at,
      u.username AS submitted_by_username,
      o.id AS org_id,
      o.name AS org_name,
      COALESCE(partner.username, current_partner.username) AS di_partner_username
    FROM submissions s
    LEFT JOIN users u ON u.id = s.submitted_by
    LEFT JOIN organizations o ON o.id = s.org_id
    LEFT JOIN users partner ON partner.id = s.di_partner_id
    LEFT JOIN users current_partner ON current_partner.id = u.di_partner_id AND s.is_di = TRUE
    ORDER BY s.created_at DESC
  `;

  const subIds = result.rows.map((r: Record<string, unknown>) => r.id as string);
  if (subIds.length === 0) return ok({});

  // Batch load evidence
  const ev = await sql.query(
    `SELECT submission_id, url, explanation, sort_order
     FROM submission_evidence WHERE submission_id = ANY($1)
     ORDER BY sort_order`,
    [subIds]
  );
  const evidenceMap: Record<string, Array<Record<string, unknown>>> = {};
  for (const row of ev.rows) {
    if (!evidenceMap[row.submission_id]) evidenceMap[row.submission_id] = [];
    evidenceMap[row.submission_id].push(row);
  }

  // Batch load inline edits
  const edits = await sql.query(
    `SELECT submission_id, original_text, replacement_text, reasoning, sort_order, approved
     FROM submission_inline_edits WHERE submission_id = ANY($1)
     ORDER BY sort_order`,
    [subIds]
  );
  const editsMap: Record<string, Array<Record<string, unknown>>> = {};
  for (const row of edits.rows) {
    if (!editsMap[row.submission_id]) editsMap[row.submission_id] = [];
    editsMap[row.submission_id].push(row);
  }

  // Batch load jury assignments
  const jurors = await sql.query(
    `SELECT ja.submission_id, ja.role, ja.accepted, ja.accepted_at, ja.in_pool, u.username
     FROM jury_assignments ja
     LEFT JOIN users u ON u.id = ja.user_id
     WHERE ja.submission_id = ANY($1)
     ORDER BY ja.assigned_at`,
    [subIds]
  );
  const jurorsMap: Record<string, Array<Record<string, unknown>>> = {};
  for (const row of jurors.rows) {
    if (!jurorsMap[row.submission_id]) jurorsMap[row.submission_id] = [];
    jurorsMap[row.submission_id].push(row);
  }

  // Batch load votes
  const votes = await sql.query(
    `SELECT jv.submission_id, jv.role, jv.approve, jv.note,
            jv.deliberate_lie, jv.newsworthy, jv.interesting, jv.voted_at,
            u.username
     FROM jury_votes jv
     LEFT JOIN users u ON u.id = jv.user_id
     WHERE jv.submission_id = ANY($1)
     ORDER BY jv.voted_at`,
    [subIds]
  );
  const votesMap: Record<string, Array<Record<string, unknown>>> = {};
  for (const row of votes.rows) {
    if (!votesMap[row.submission_id]) votesMap[row.submission_id] = [];
    votesMap[row.submission_id].push(row);
  }

  // Batch load linked vault entries
  const linked = await sql.query(
    `SELECT submission_id, entry_type, entry_id, label, detail
     FROM submission_linked_entries WHERE submission_id = ANY($1)`,
    [subIds]
  );
  const linkedMap: Record<string, Array<Record<string, unknown>>> = {};
  for (const row of linked.rows) {
    if (!linkedMap[row.submission_id]) linkedMap[row.submission_id] = [];
    linkedMap[row.submission_id].push(row);
  }

  // Build SPA-format keyed object
  const subs: Record<string, unknown> = {};
  for (const row of result.rows) {
    const id = row.id as string;
    const allJurors = jurorsMap[id] || [];
    const inGroupJurors = allJurors.filter(j => j.role === "in_group").map(j => j.username as string);
    const crossGroupJurors = allJurors.filter(j => j.role === "cross_group").map(j => j.username as string);
    const acceptedInGroup = allJurors.filter(j => j.role === "in_group" && j.accepted).map(j => j.username as string);
    const acceptedCrossGroup = allJurors.filter(j => j.role === "cross_group" && j.accepted).map(j => j.username as string);
    const juryPool = allJurors.filter(j => j.role === "in_group" && j.in_pool).map(j => j.username as string);
    const crossGroupJuryPool = allJurors.filter(j => j.role === "cross_group" && j.in_pool).map(j => j.username as string);

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

    subs[id] = {
      id,
      submissionType: row.submission_type,
      status: row.status,
      url: row.url,
      normalizedUrl: row.normalized_url,
      originalHeadline: row.original_headline,
      replacement: row.replacement,
      reasoning: row.reasoning,
      author: row.author,
      trustedSkip: row.trusted_skip,
      isDI: row.is_di,
      diPartner: row.di_partner_username,
      jurySeats: row.jury_seats,
      jurySeed: row.jury_seed,
      internalJurySize: row.internal_jury_size,
      crossGroupJurySize: row.cross_group_jury_size,
      crossGroupSeed: row.cross_group_seed,
      deliberateLieFinding: row.deliberate_lie_finding,
      survivalCount: row.survival_count,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
      submittedBy: row.submitted_by_username || "unknown",
      orgId: row.org_id,
      orgName: row.org_name || "Unknown Org",
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
      juryPool,
      acceptedJurors: acceptedInGroup,
      acceptedAt: Object.fromEntries(
        allJurors.filter(j => j.role === "in_group" && j.accepted_at)
          .map(j => [j.username, j.accepted_at])
      ),
      votes: inGroupVotes,
      crossGroupJurors,
      crossGroupJuryPool,
      crossGroupAcceptedJurors: acceptedCrossGroup,
      crossGroupAcceptedAt: Object.fromEntries(
        allJurors.filter(j => j.role === "cross_group" && j.accepted_at)
          .map(j => [j.username, j.accepted_at])
      ),
      crossGroupVotes,
      anonMap: {},
      auditTrail: [],
    };
  }

  return ok(subs);
}
