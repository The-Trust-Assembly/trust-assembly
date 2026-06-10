// Trust Assembly Scoring — accrual layer
// -------------------------------------------
// Translates verdicts into the four-score ledger (spec A4-A7):
// citizen_scores tallies + append-only score_events. All operations
// are fail-soft behind a probe — until migration 027 runs, scoring
// accrual is invisible and can never block a resolution.
//
// Design rules enforced here:
// - Every adjudicated item adds to possible; passes add to earned.
// - Jurors earn item value when their vote matches the jury outcome.
// - Rescue bonuses (Cassandra/Whistleblower) grow the NUMERATOR only
//   and are recorded as visible named events, never silent edits.
// - Deception findings increment a divisor counter; the original
//   record is preserved.

import { sql } from "@/lib/db";
import { itemValue, rescueBonus, tallySubmission } from "./engine";
import type { ScoredItemType, QualityTier, ScoreRole, ScoreScope } from "./constants";
import { DECEPTION_AUTOBAN_THRESHOLD } from "./constants";
import { createNotification } from "@/lib/notifications";

const ZERO_ORG = "00000000-0000-0000-0000-000000000000";

// ─── Availability probe ────────────────────────────────────────────

let probe: { enabled: boolean; checkedAt: number } | null = null;
const PROBE_TTL_MS = 5 * 60 * 1000;

export async function scoringEnabled(): Promise<boolean> {
  if (probe && Date.now() - probe.checkedAt < PROBE_TTL_MS) return probe.enabled;
  try {
    await sql`SELECT 1 FROM citizen_scores LIMIT 1`;
    await sql`SELECT 1 FROM score_events LIMIT 1`;
    probe = { enabled: true, checkedAt: Date.now() };
  } catch {
    probe = { enabled: false, checkedAt: Date.now() };
  }
  return probe.enabled;
}

// ─── Core event writer ─────────────────────────────────────────────

export interface ScoreEvent {
  userId: string;
  role: ScoreRole;
  scope: ScoreScope;
  orgId?: string | null;
  eventType: "item_adjudicated" | "juror_vote_scored" | "cassandra_bonus" | "whistleblower_bonus" | "deception_finding" | "backfill";
  submissionId?: string | null;
  disputeId?: string | null;
  itemType?: ScoredItemType | null;
  quality?: QualityTier | null;
  pointsEarned?: number;
  pointsPossible?: number;
  bonus?: number;
  deceptionDelta?: number;
  detail?: Record<string, unknown>;
}

// Insert the ledger row and upsert the tally in one transaction.
// Returns the post-update deception count (used for the ban check).
export async function recordScoreEvent(ev: ScoreEvent): Promise<{ ok: boolean; deceptionFindings?: number }> {
  if (!(await scoringEnabled())) return { ok: false };

  const earned = ev.pointsEarned || 0;
  const possible = ev.pointsPossible || 0;
  const bonus = ev.bonus || 0;
  const deception = ev.deceptionDelta || 0;
  const orgId = ev.scope === "assembly" ? ev.orgId || null : null;

  const client = await sql.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO score_events (user_id, role, scope, org_id, event_type, submission_id, dispute_id,
                                 item_type, quality, points_earned, points_possible, bonus, detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [ev.userId, ev.role, ev.scope, orgId, ev.eventType, ev.submissionId || null, ev.disputeId || null,
       ev.itemType || null, ev.quality || null, earned, possible, bonus,
       ev.detail ? JSON.stringify(ev.detail) : null]
    );
    const upsert = await client.query(
      `INSERT INTO citizen_scores (user_id, role, scope, org_id, points_earned, points_possible, rescue_bonus, deception_findings, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
       ON CONFLICT (user_id, role, scope, COALESCE(org_id, '${ZERO_ORG}'::uuid)) DO UPDATE
       SET points_earned = citizen_scores.points_earned + EXCLUDED.points_earned,
           points_possible = citizen_scores.points_possible + EXCLUDED.points_possible,
           rescue_bonus = citizen_scores.rescue_bonus + EXCLUDED.rescue_bonus,
           deception_findings = citizen_scores.deception_findings + EXCLUDED.deception_findings,
           updated_at = now()
       RETURNING deception_findings`,
      [ev.userId, ev.role, ev.scope, orgId, earned, possible, bonus, deception]
    );
    await client.query("COMMIT");
    return { ok: true, deceptionFindings: Number(upsert.rows[0]?.deception_findings ?? 0) };
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    console.warn(`[scoring] event failed (${ev.eventType} for ${ev.userId}):`, e instanceof Error ? e.message : e);
    return { ok: false };
  } finally {
    client.release();
  }
}

// ─── Quality tier from jury ratings (spec B3 decision 1) ───────────

export function qualityFromVotes(
  votes: Array<{ newsworthy: number | null; interesting: number | null }>
): QualityTier {
  const ratings: number[] = [];
  for (const v of votes) {
    if (v.newsworthy) ratings.push(v.newsworthy);
    if (v.interesting) ratings.push(v.interesting);
  }
  if (ratings.length === 0) return "normal";
  const avg = ratings.reduce((s, r) => s + r, 0) / ratings.length;
  if (avg < 4) return "low";
  if (avg > 7) return "high";
  return "normal";
}

// ─── Item enumeration for a submission (spec A3) ───────────────────

const VAULT_ITEM_TABLES: Array<{ table: string; type: ScoredItemType }> = [
  { table: "vault_entries", type: "standing_correction" },
  { table: "arguments", type: "argument" },
  { table: "beliefs", type: "foundational_belief" },
  { table: "translations", type: "translation" },
];

export async function getSubmissionItemTypes(submissionId: string): Promise<ScoredItemType[]> {
  const items: ScoredItemType[] = [];
  try {
    const subResult = await sql`SELECT type FROM submissions WHERE id = ${submissionId} LIMIT 1`;
    const subType = subResult.rows[0]?.type as string | undefined;
    items.push(subType === "affirmation" ? "affirmation" : "headline_correction");

    const edits = await sql`SELECT COUNT(*)::int AS count FROM submission_inline_edits WHERE submission_id = ${submissionId}`;
    for (let i = 0; i < (edits.rows[0]?.count || 0); i++) items.push("body_edit");

    for (const { table, type } of VAULT_ITEM_TABLES) {
      const result = await sql.query(
        `SELECT COUNT(*)::int AS count FROM ${table} WHERE submission_id = $1`,
        [submissionId]
      );
      for (let i = 0; i < (result.rows[0]?.count || 0); i++) items.push(type);
    }
  } catch (e) {
    console.warn("[scoring] item enumeration failed:", e instanceof Error ? e.message : e);
    if (items.length === 0) items.push("headline_correction");
  }
  return items;
}

// ─── Submission resolution accrual (spec A4 + A5) ──────────────────

export async function accrueSubmissionResolution(params: {
  submissionId: string;
  outcome: string;             // approved | rejected | consensus | consensus_rejected
  isCross: boolean;
  orgId: string;
  submitterId: string;         // already DI-partner-resolved by caller
  wasLie: boolean;
  votes: Array<{ user_id: string; approve: boolean; newsworthy: number | null; interesting: number | null }>;
}): Promise<void> {
  if (!(await scoringEnabled())) return;

  const { submissionId, outcome, isCross, orgId, submitterId, wasLie, votes } = params;
  const passed = outcome === "approved" || outcome === "consensus";
  const scope: ScoreScope = isCross ? "system" : "assembly";
  const quality = qualityFromVotes(votes);
  const itemTypes = await getSubmissionItemTypes(submissionId);

  // All items inherit the submission verdict in the current jury model.
  const tally = tallySubmission(itemTypes.map((type) => ({ type, quality, passed })));

  await recordScoreEvent({
    userId: submitterId,
    role: "submitter",
    scope,
    orgId,
    eventType: "item_adjudicated",
    submissionId,
    quality,
    pointsEarned: tally.earned,
    pointsPossible: tally.possible,
    detail: { outcome, items: itemTypes, itemCount: itemTypes.length },
  });

  // Deception finding: divisor counter + auto-ban review at threshold
  if (wasLie && !passed) {
    const result = await recordScoreEvent({
      userId: submitterId,
      role: "submitter",
      scope,
      orgId,
      eventType: "deception_finding",
      submissionId,
      deceptionDelta: 1,
      detail: { outcome },
    });
    if (result.ok && (result.deceptionFindings || 0) >= DECEPTION_AUTOBAN_THRESHOLD) {
      try {
        await sql`
          INSERT INTO audit_log (action, user_id, org_id, entity_type, entity_id, metadata)
          VALUES ('Deception threshold reached — ban review triggered', ${submitterId}, ${orgId}, 'user', ${submitterId},
                  ${JSON.stringify({ findings: result.deceptionFindings, scope })}::jsonb)
        `;
      } catch {}
    }
  }

  // Jurors: full item-set value at stake; earned when vote matched outcome
  const totalValue = itemTypes.reduce((sum, type) => sum + itemValue(type, quality), 0);
  for (const vote of votes) {
    const matched = vote.approve === passed;
    await recordScoreEvent({
      userId: vote.user_id,
      role: "juror",
      scope,
      orgId,
      eventType: "juror_vote_scored",
      submissionId,
      quality,
      pointsEarned: matched ? totalValue : 0,
      pointsPossible: totalValue,
      detail: { outcome, matched },
    });
  }
}

// ─── Rescue bonuses on dispute flips (spec A6) ─────────────────────

// When a dispute overturns a prior outcome:
// - challenge_rejection upheld → the submission was right all along:
//   Cassandra fires for the submitter, Whistleblower for original
//   jurors who voted approve (the vindicated minority).
// - challenge_approval upheld → the approval was wrong: Whistleblower
//   fires for original jurors who voted reject.
// n = the dispute round (original rejection + failed rounds before this one).
export async function accrueRescueBonuses(params: {
  disputeId: string;
  submissionId: string;
  orgId: string;
  disputeType: string;          // challenge_rejection | challenge_approval
  round: number;
  originalSubmitterId: string;
}): Promise<void> {
  if (!(await scoringEnabled())) return;

  const { disputeId, submissionId, orgId, disputeType, round, originalSubmitterId } = params;
  const n = Math.max(1, round);

  // Submission points basis: what the submitter's record put at stake.
  let submissionPoints = 0;
  try {
    const result = await sql`
      SELECT COALESCE(SUM(points_possible), 0) AS total
      FROM score_events
      WHERE submission_id = ${submissionId} AND role = 'submitter' AND event_type = 'item_adjudicated'
    `;
    submissionPoints = Number(result.rows[0]?.total || 0);
  } catch {}
  if (submissionPoints <= 0) {
    // Legacy submission adjudicated before scoring existed — reconstruct at normal quality
    const itemTypes = await getSubmissionItemTypes(submissionId);
    submissionPoints = itemTypes.reduce((sum, type) => sum + itemValue(type, "normal"), 0);
  }

  const bonus = rescueBonus(submissionPoints, n);
  if (bonus <= 0) return;

  // Cassandra: only when a rejected submission is vindicated
  if (disputeType === "challenge_rejection") {
    await recordScoreEvent({
      userId: originalSubmitterId,
      role: "submitter",
      scope: "assembly",
      orgId,
      eventType: "cassandra_bonus",
      submissionId,
      disputeId,
      bonus,
      detail: { rejectionDepth: n, submissionPoints },
    });
    createNotification({
      userId: originalSubmitterId,
      type: "cassandra_bonus",
      title: `Cassandra bonus fired: +${bonus} points`,
      body: `Your submission was vindicated after ${n} rejection${n > 1 ? "s" : ""}. The system was later corrected in your favor.`,
      entityType: "submission",
      entityId: submissionId,
    }).catch(() => {});
  }

  // Whistleblower: original in-group jurors whose vote was the
  // now-vindicated minority position
  const vindicatedVoteWasApprove = disputeType === "challenge_rejection";
  try {
    const minority = await sql`
      SELECT user_id FROM jury_votes
      WHERE submission_id = ${submissionId} AND dispute_id IS NULL
        AND role = 'in_group' AND approve = ${vindicatedVoteWasApprove}
    `;
    for (const row of minority.rows) {
      await recordScoreEvent({
        userId: row.user_id as string,
        role: "juror",
        scope: "assembly",
        orgId,
        eventType: "whistleblower_bonus",
        submissionId,
        disputeId,
        bonus,
        detail: { rejectionDepth: n, submissionPoints },
      });
      createNotification({
        userId: row.user_id as string,
        type: "whistleblower_bonus",
        title: `Whistleblower bonus fired: +${bonus} points`,
        body: `You voted against the group and a later jury proved you right.`,
        entityType: "submission",
        entityId: submissionId,
      }).catch(() => {});
    }
  } catch (e) {
    console.warn("[scoring] whistleblower accrual failed:", e instanceof Error ? e.message : e);
  }
}
