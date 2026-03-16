import { sql } from "@/lib/db";
import { ok } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

// GET /api/data/users — returns ALL users keyed by username
// in the format the v5 SPA expects. Excludes password hashes.
// This replaces sG(SK.USERS) reads from the deprecated KV store.
export async function GET() {
  const result = await sql`
    SELECT
      u.id, u.username, u.display_name, u.real_name, u.email,
      u.gender, u.age, u.country, u.state, u.political_affiliation, u.bio,
      u.is_di, u.di_approved, u.is_admin,
      u.total_wins, u.total_losses, u.current_streak,
      u.dispute_wins, u.dispute_losses, u.deliberate_lies,
      u.last_deception_finding, u.created_at, u.ip_hash,
      u.primary_org_id,
      partner.username AS di_partner_username
    FROM users u
    LEFT JOIN users partner ON partner.id = u.di_partner_id
    ORDER BY u.created_at ASC
  `;

  // Get org memberships for all users
  const memberships = await sql`
    SELECT om.user_id, o.id AS org_id, om.is_founder, om.assembly_streak
    FROM organization_members om
    JOIN organizations o ON o.id = om.org_id
    WHERE om.is_active = TRUE
    ORDER BY om.joined_at ASC
  `;
  const orgMap: Record<string, string[]> = {};
  const streakMap: Record<string, Record<string, number>> = {};
  for (const row of memberships.rows) {
    if (!orgMap[row.user_id]) orgMap[row.user_id] = [];
    orgMap[row.user_id].push(row.org_id);
    if (!streakMap[row.user_id]) streakMap[row.user_id] = {};
    streakMap[row.user_id][row.org_id] = row.assembly_streak || 0;
  }

  // Get user ratings
  const ratings = await sql`
    SELECT user_id, newsworthy, interesting
    FROM user_ratings
    ORDER BY created_at ASC
  `;
  const ratingsMap: Record<string, Array<{ newsworthy: number; interesting: number }>> = {};
  for (const row of ratings.rows) {
    if (!ratingsMap[row.user_id]) ratingsMap[row.user_id] = [];
    ratingsMap[row.user_id].push({
      newsworthy: row.newsworthy,
      interesting: row.interesting,
    });
  }

  // Get user badges
  const badges = await sql`
    SELECT user_id, badge_id, detail, awarded_at
    FROM user_badges
    ORDER BY awarded_at ASC
  `;
  const badgesMap: Record<string, Array<Record<string, unknown>>> = {};
  for (const row of badges.rows) {
    if (!badgesMap[row.user_id]) badgesMap[row.user_id] = [];
    badgesMap[row.user_id].push({
      id: row.badge_id,
      detail: row.detail,
      awardedAt: row.awarded_at,
    });
  }

  // Get notifications (last 50 per user)
  const notifications = await sql`
    SELECT user_id, id, type, title, body, entity_type, entity_id, read, created_at
    FROM notifications
    ORDER BY created_at DESC
  `;
  const notifsMap: Record<string, Array<Record<string, unknown>>> = {};
  for (const row of notifications.rows) {
    if (!notifsMap[row.user_id]) notifsMap[row.user_id] = [];
    if (notifsMap[row.user_id].length < 50) {
      notifsMap[row.user_id].push({
        id: row.id,
        type: row.type,
        data: { title: row.title, body: row.body, entityType: row.entity_type, entityId: row.entity_id },
        read: row.read,
        createdAt: row.created_at,
      });
    }
  }

  const users: Record<string, unknown> = {};
  for (const row of result.rows) {
    const uid = row.id as string;
    const username = row.username as string;
    const userOrgIds = orgMap[uid] || [];

    users[username] = {
      id: uid,
      username,
      displayName: row.display_name,
      realName: row.real_name,
      email: row.email,
      gender: row.gender,
      age: row.age,
      country: row.country,
      state: row.state,
      location: row.state ? `${row.state}, ${row.country}` : (row.country || ""),
      politicalAffiliation: row.political_affiliation,
      bio: row.bio,
      isDI: row.is_di,
      diPartner: row.di_partner_username,
      diApproved: row.di_approved,
      isAdmin: row.is_admin,
      signupDate: row.created_at,
      signupTimestamp: row.created_at ? new Date(row.created_at as string).getTime() : 0,
      ipHash: row.ip_hash,
      orgId: row.primary_org_id || userOrgIds[0] || null,
      orgIds: userOrgIds,
      totalWins: row.total_wins || 0,
      totalLosses: row.total_losses || 0,
      currentStreak: row.current_streak || 0,
      requiredStreak: 3,
      assemblyStreaks: streakMap[uid] || {},
      disputeWins: row.dispute_wins || 0,
      disputeLosses: row.dispute_losses || 0,
      deliberateLies: row.deliberate_lies || 0,
      lastDeceptionFinding: row.last_deception_finding,
      ratingsReceived: ratingsMap[uid] || [],
      reviewHistory: [],
      retractions: [],
      manualBadges: badgesMap[uid] || [],
      notifications: notifsMap[uid] || [],
    };
  }

  return ok(users);
}
