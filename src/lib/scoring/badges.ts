// Trust Assembly Scoring — badge seed points
// -----------------------------------------------
// Badges add POINTS OVER POINTS: a 1-point badge adds 1 to both the
// numerator (earned) and denominator (possible) of every score. This
// is deliberate cold-start design — a brand-new citizen who joins
// assemblies, submits once, and serves on a jury has a small tested
// record from day one instead of an empty 0/0, and the seed dilutes
// toward irrelevance as real adjudicated work accumulates.
//
// Mirrors the milestone logic in spa/lib/scoring.js computeBadges()
// with SQL counts. If the two drift, the client controls what badges
// DISPLAY; this module controls what they're WORTH. Batched: a
// handful of grouped queries regardless of how many users are asked
// about. Fail-soft: any error returns an empty map.

import { sql } from "@/lib/db";

const TRUSTED_STREAK = 10;

// Manually awarded badges default to 1 point; specials listed here.
const MANUAL_BADGE_POINTS: Record<string, number> = {
  firstTester: 10,
};

const SUBMISSION_THRESHOLDS = [1, 10, 100, 1000, 10000, 100000, 1000000];
const VOTE_THRESHOLDS = [1, 10, 25, 50, 100];
const DISPUTE_WIN_THRESHOLDS = [1, 5, 10, 20, 50, 100];
const DI_SUB_THRESHOLDS = [10, 100, 1000, 10000, 100000];
const FOUNDER_MEMBER_THRESHOLDS = [5, 51, 101, 1000];

function thresholdCount(value: number, thresholds: number[]): number {
  return thresholds.filter((t) => value >= t).length;
}

// Compute badge seed points for a batch of users. One point per badge
// unless the badge definition says otherwise.
export async function getBadgePoints(userIds: string[]): Promise<Map<string, number>> {
  const points = new Map<string, number>();
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return points;
  for (const id of ids) points.set(id, 0);
  const add = (userId: string, n: number) => {
    if (points.has(userId) && n > 0) points.set(userId, points.get(userId)! + n);
  };

  try {
    // Founded assemblies (non-GP): 1 per org + founder member milestones
    const founded = await sql.query(
      `SELECT o.created_by AS user_id, o.id,
              (SELECT COUNT(*) FROM organization_members om WHERE om.org_id = o.id AND om.is_active = TRUE) AS member_count
       FROM organizations o
       WHERE o.created_by = ANY($1) AND o.is_general_public = FALSE`,
      [ids]
    );
    for (const row of founded.rows) {
      add(row.user_id, 1); // Assembly Creator
      add(row.user_id, thresholdCount(Number(row.member_count), FOUNDER_MEMBER_THRESHOLDS));
    }

    // Memberships: joinOne (≥1 non-GP), joinSix (≥6 incl GP), joinTwelve (≥12)
    const memberships = await sql.query(
      `SELECT om.user_id, COUNT(*) AS non_gp
       FROM organization_members om
       JOIN organizations o ON o.id = om.org_id
       WHERE om.user_id = ANY($1) AND om.is_active = TRUE AND o.is_general_public = FALSE
       GROUP BY om.user_id`,
      [ids]
    );
    for (const row of memberships.rows) {
      const nonGp = Number(row.non_gp);
      const total = nonGp + 1; // everyone is in The General Public
      add(row.user_id, (nonGp >= 1 ? 1 : 0) + (total >= 6 ? 1 : 0) + (total >= 12 ? 1 : 0));
    }

    // Submission milestones
    const subs = await sql.query(
      `SELECT submitted_by AS user_id, COUNT(*) AS count
       FROM submissions WHERE submitted_by = ANY($1) GROUP BY submitted_by`,
      [ids]
    );
    for (const row of subs.rows) add(row.user_id, thresholdCount(Number(row.count), SUBMISSION_THRESHOLDS));

    // Jury vote milestones
    const votes = await sql.query(
      `SELECT user_id, COUNT(*) AS count FROM jury_votes WHERE user_id = ANY($1) GROUP BY user_id`,
      [ids]
    );
    for (const row of votes.rows) add(row.user_id, thresholdCount(Number(row.count), VOTE_THRESHOLDS));

    // Dispute win milestones + early adopter (signup rank)
    const userRows = await sql.query(
      `SELECT id, dispute_wins,
              (SELECT COUNT(*) FROM users u2 WHERE u2.created_at < u.created_at) AS signup_rank
       FROM users u WHERE id = ANY($1)`,
      [ids]
    );
    for (const row of userRows.rows) {
      add(row.id, thresholdCount(Number(row.dispute_wins || 0), DISPUTE_WIN_THRESHOLDS));
      const rank = Number(row.signup_rank);
      add(row.id, (rank < 100 ? 1 : 0) + (rank < 1000 ? 1 : 0));
    }

    // AI Agent partnership: 1 for having an agent + DI submission milestones
    const diPartners = await sql.query(
      `SELECT di_partner_id AS user_id, COUNT(*) AS agents FROM users
       WHERE is_di = TRUE AND di_partner_id = ANY($1) GROUP BY di_partner_id`,
      [ids]
    );
    for (const row of diPartners.rows) add(row.user_id, 1);
    const diSubs = await sql.query(
      `SELECT u.di_partner_id AS user_id, COUNT(*) AS count
       FROM submissions s JOIN users u ON u.id = s.submitted_by
       WHERE u.is_di = TRUE AND u.di_partner_id = ANY($1)
       GROUP BY u.di_partner_id`,
      [ids]
    );
    for (const row of diSubs.rows) add(row.user_id, thresholdCount(Number(row.count), DI_SUB_THRESHOLDS));

    // Trusted Contributor: per assembly with streak ≥ 10
    const trusted = await sql.query(
      `SELECT user_id, COUNT(*) AS orgs FROM organization_members
       WHERE user_id = ANY($1) AND is_active = TRUE AND assembly_streak >= ${TRUSTED_STREAK}
       GROUP BY user_id`,
      [ids]
    );
    for (const row of trusted.rows) add(row.user_id, Number(row.orgs));

    // Manually awarded badges
    const manual = await sql.query(
      `SELECT user_id, badge_id FROM user_badges WHERE user_id = ANY($1)`,
      [ids]
    );
    for (const row of manual.rows) add(row.user_id, MANUAL_BADGE_POINTS[row.badge_id] || 1);
  } catch (e) {
    console.warn("[scoring] badge points failed (returning what we have):", e instanceof Error ? e.message : e);
  }

  return points;
}
