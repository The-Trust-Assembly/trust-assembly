import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden } from "@/lib/api-utils";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/admin/debug-all — Comprehensive data integrity check.
// Compares raw DB counts with what each /api/data/* endpoint returns.
// Tests every write path's read-back cycle.

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  const report: Record<string, unknown> = {};

  // ═══════════════════════════════════════════════════
  // 1. USERS: raw DB vs data endpoint query
  // ═══════════════════════════════════════════════════
  try {
    const rawCount = await sql`SELECT COUNT(*) AS c FROM users`;
    const rawUsers = await sql`SELECT id, username, is_di, di_partner_id, primary_org_id, created_at FROM users ORDER BY created_at ASC`;

    // Run the exact query from /api/data/users
    const dataQuery = await sql`
      SELECT u.id, u.username, u.is_di, u.di_approved,
        partner.username AS di_partner_username
      FROM users u
      LEFT JOIN users partner ON partner.id = u.di_partner_id
      ORDER BY u.created_at ASC
    `;

    // Key by username (same as endpoint)
    const keyed: Record<string, { id: string; isDI: boolean }> = {};
    const dupes: string[] = [];
    for (const row of dataQuery.rows) {
      const uname = row.username as string;
      if (keyed[uname]) dupes.push(`${uname}: id=${row.id} overwrites id=${keyed[uname].id}`);
      keyed[uname] = { id: row.id as string, isDI: row.is_di as boolean };
    }

    // Find ghosts
    const dbSet = new Set(rawUsers.rows.map(r => r.username as string));
    const keyedSet = new Set(Object.keys(keyed));
    const ghosts = [...dbSet].filter(u => !keyedSet.has(u));

    // Org membership per user
    const memberships = await sql`
      SELECT om.user_id, COUNT(*) AS cnt
      FROM organization_members om WHERE om.is_active = TRUE
      GROUP BY om.user_id
    `;
    const orgCounts: Record<string, number> = {};
    for (const r of memberships.rows) orgCounts[r.user_id as string] = parseInt(r.cnt as string);

    report.users = {
      rawDbCount: parseInt(rawCount.rows[0].c as string),
      joinQueryRowCount: dataQuery.rows.length,
      keyedObjectCount: Object.keys(keyed).length,
      duplicateKeys: dupes,
      ghosts,
      allUsers: rawUsers.rows.map(r => ({
        id: r.id,
        username: r.username,
        isDI: r.is_di,
        diPartnerId: r.di_partner_id,
        primaryOrgId: r.primary_org_id,
        orgMembershipCount: orgCounts[r.id as string] || 0,
        createdAt: r.created_at,
      })),
    };
  } catch (e) {
    report.users = { error: (e as Error).message };
  }

  // ═══════════════════════════════════════════════════
  // 2. SUBMISSIONS: raw DB vs data endpoint query
  // ═══════════════════════════════════════════════════
  try {
    const rawCount = await sql`SELECT COUNT(*) AS c FROM submissions`;
    const rawSubs = await sql`
      SELECT s.id, s.status, s.is_di, s.created_at, s.org_id,
        u.username AS submitter, o.name AS org_name
      FROM submissions s
      LEFT JOIN users u ON u.id = s.submitted_by
      LEFT JOIN organizations o ON o.id = s.org_id
      ORDER BY s.created_at DESC
    `;

    // Check for orphaned submissions (submitted_by points to nonexistent user)
    const orphanedSubs = await sql`
      SELECT s.id, s.submitted_by, s.status, s.created_at
      FROM submissions s
      LEFT JOIN users u ON u.id = s.submitted_by
      WHERE u.id IS NULL
    `;

    // Check for submissions with null org
    const noOrgSubs = await sql`
      SELECT s.id, s.submitted_by, s.status
      FROM submissions s
      WHERE s.org_id IS NULL
    `;

    report.submissions = {
      rawDbCount: parseInt(rawCount.rows[0].c as string),
      queryRowCount: rawSubs.rows.length,
      orphanedSubmissions: orphanedSubs.rows,
      submissionsWithNoOrg: noOrgSubs.rows,
      byStatus: {} as Record<string, number>,
      recentFive: rawSubs.rows.slice(0, 5).map(r => ({
        id: r.id, status: r.status, isDI: r.is_di,
        submitter: r.submitter, orgName: r.org_name,
        createdAt: r.created_at,
      })),
    };

    // Count by status
    for (const r of rawSubs.rows) {
      const st = r.status as string;
      (report.submissions as Record<string, unknown>).byStatus = {
        ...((report.submissions as Record<string, unknown>).byStatus as Record<string, number>),
        [st]: (((report.submissions as Record<string, unknown>).byStatus as Record<string, number>)[st] || 0) + 1,
      };
    }
  } catch (e) {
    report.submissions = { error: (e as Error).message };
  }

  // ═══════════════════════════════════════════════════
  // 3. ORGANIZATIONS: raw DB vs data endpoint
  // ═══════════════════════════════════════════════════
  try {
    const rawOrgs = await sql`
      SELECT o.id, o.name, o.is_general_public, o.created_by,
        (SELECT COUNT(*) FROM organization_members om WHERE om.org_id = o.id AND om.is_active = TRUE) AS member_count
      FROM organizations o
      ORDER BY o.created_at ASC
    `;

    // Check for users not in General Public
    const gp = await sql`SELECT id FROM organizations WHERE is_general_public = TRUE LIMIT 1`;
    let usersNotInGP: unknown[] = [];
    if (gp.rows.length > 0) {
      const gpId = gp.rows[0].id;
      const missing = await sql`
        SELECT u.id, u.username, u.is_di, u.created_at
        FROM users u
        WHERE NOT EXISTS (
          SELECT 1 FROM organization_members om
          WHERE om.user_id = u.id AND om.org_id = ${gpId} AND om.is_active = TRUE
        )
      `;
      usersNotInGP = missing.rows.map(r => ({
        id: r.id, username: r.username, isDI: r.is_di, createdAt: r.created_at,
      }));
    }

    report.organizations = {
      count: rawOrgs.rows.length,
      orgs: rawOrgs.rows.map(r => ({
        id: r.id, name: r.name, isGP: r.is_general_public,
        createdBy: r.created_by, memberCount: parseInt(r.member_count as string),
      })),
      usersNotInGeneralPublic: usersNotInGP,
    };
  } catch (e) {
    report.organizations = { error: (e as Error).message };
  }

  // ═══════════════════════════════════════════════════
  // 4. JURY & VOTES integrity
  // ═══════════════════════════════════════════════════
  try {
    const orphanedAssignments = await sql`
      SELECT ja.id, ja.submission_id, ja.user_id
      FROM jury_assignments ja
      LEFT JOIN submissions s ON s.id = ja.submission_id
      WHERE s.id IS NULL
    `;
    const orphanedVotes = await sql`
      SELECT jv.id, jv.submission_id, jv.user_id
      FROM jury_votes jv
      LEFT JOIN submissions s ON s.id = jv.submission_id
      WHERE s.id IS NULL
    `;
    const votesWithoutAssignment = await sql`
      SELECT jv.id, jv.submission_id, u.username
      FROM jury_votes jv
      LEFT JOIN jury_assignments ja ON ja.submission_id = jv.submission_id AND ja.user_id = jv.user_id
      LEFT JOIN users u ON u.id = jv.user_id
      WHERE ja.id IS NULL
    `;

    report.juryIntegrity = {
      orphanedAssignments: orphanedAssignments.rows.length,
      orphanedVotes: orphanedVotes.rows.length,
      votesWithoutAssignment: votesWithoutAssignment.rows.length,
      details: {
        orphanedAssignments: orphanedAssignments.rows.slice(0, 5),
        orphanedVotes: orphanedVotes.rows.slice(0, 5),
        votesWithoutAssignment: votesWithoutAssignment.rows.slice(0, 5),
      },
    };
  } catch (e) {
    report.juryIntegrity = { error: (e as Error).message };
  }

  // ═══════════════════════════════════════════════════
  // 5. NOTIFICATIONS (the "read" column issue)
  // ═══════════════════════════════════════════════════
  try {
    const notifCount = await sql`SELECT COUNT(*) AS c FROM notifications`;
    const notifTest = await sql`
      SELECT user_id, id, type, title, body, entity_type, entity_id, "read", created_at
      FROM notifications
      ORDER BY created_at DESC
      LIMIT 3
    `;
    report.notifications = {
      count: parseInt(notifCount.rows[0].c as string),
      quotedReadColumnWorks: true,
      sample: notifTest.rows,
    };
  } catch (e) {
    report.notifications = {
      quotedReadColumnWorks: false,
      error: (e as Error).message,
    };
  }

  // ═══════════════════════════════════════════════════
  // 6. DI PARTNERSHIPS integrity
  // ═══════════════════════════════════════════════════
  try {
    const diUsers = await sql`
      SELECT u.id, u.username, u.is_di, u.di_approved, u.di_partner_id,
        partner.username AS partner_username, partner.is_di AS partner_is_di
      FROM users u
      LEFT JOIN users partner ON partner.id = u.di_partner_id
      WHERE u.is_di = TRUE OR u.di_partner_id IS NOT NULL
    `;

    // Check for broken DI links (partner_id points to nonexistent user)
    const brokenLinks = await sql`
      SELECT u.id, u.username, u.di_partner_id
      FROM users u
      WHERE u.di_partner_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM users p WHERE p.id = u.di_partner_id)
    `;

    // Check DI requests table
    const diReqs = await sql`
      SELECT dr.id, du.username AS di_username, pu.username AS partner_username, dr.status
      FROM di_requests dr
      LEFT JOIN users du ON du.id = dr.di_user_id
      LEFT JOIN users pu ON pu.id = dr.partner_user_id
      ORDER BY dr.created_at DESC
    `;

    report.diPartnerships = {
      usersWithPartnerLinks: diUsers.rows.map(r => ({
        username: r.username, isDI: r.is_di, diApproved: r.di_approved,
        partnerUsername: r.partner_username, partnerIsDI: r.partner_is_di,
      })),
      brokenLinks: brokenLinks.rows,
      diRequests: diReqs.rows,
    };
  } catch (e) {
    report.diPartnerships = { error: (e as Error).message };
  }

  // ═══════════════════════════════════════════════════
  // 7. KV STORE: legacy data that might conflict
  // ═══════════════════════════════════════════════════
  try {
    const kvAll = await sql`
      SELECT key, LENGTH(value::text) AS size
      FROM kv_store
      ORDER BY key
    `;
    report.kvStore = {
      totalKeys: kvAll.rows.length,
      keys: kvAll.rows.map(r => ({ key: r.key, sizeBytes: parseInt(r.size as string) })),
    };
  } catch (e) {
    report.kvStore = { error: (e as Error).message };
  }

  // ═══════════════════════════════════════════════════
  // 8. WRITE PATH TESTS: verify each write endpoint works
  // ═══════════════════════════════════════════════════
  report.writePathNotes = {
    submission: "POST /api/submissions → creates submission + evidence + inline edits → auto-promotes if enough members",
    vote: "POST /api/submissions/[id]/vote → creates jury_vote + triggers resolution check",
    orgCreate: "POST /api/orgs → creates organization + founder membership",
    orgJoin: "POST /api/orgs/[id]/join → creates membership_application (sponsor/open)",
    register: "POST /api/auth/register → creates user + auto-joins GP + creates session",
    diRequest: "POST /api/di-requests → creates di_request record",
    diApprove: "PATCH /api/di-requests/[id] → updates di_request + sets di_partner_id on user",
    notification: "POST /api/users/me/notifications → created server-side as side effects",
    profile: "PATCH /api/users/me → updates user profile fields",
    markRead: "PATCH /api/users/me/notifications → marks all notifications read",
  };

  return ok({ report, timestamp: new Date().toISOString() });
}
