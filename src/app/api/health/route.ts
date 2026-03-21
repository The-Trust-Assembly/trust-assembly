import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ok, err } from "@/lib/api-utils";
import { getMajority } from "@/lib/jury-rules";
import { reconcileStalledSubmissions } from "@/lib/vote-resolution";

export const dynamic = "force-dynamic";

// GET /api/health — diagnostic endpoint to identify data flow issues.
// Returns the state of all critical systems: DB connection, auth, table counts,
// and any errors encountered. No auth required for basic checks.
export async function GET() {
  const checks: Record<string, unknown> = {};
  const errors: string[] = [];

  // 0. Database identity — which DB is this environment connected to?
  try {
    const pgUrl = process.env.POSTGRES_URL || "";
    const parsed = pgUrl ? new URL(pgUrl) : null;
    checks.dbIdentity = {
      host: parsed?.hostname || "unknown",
      database: parsed?.pathname?.replace("/", "") || "unknown",
      user: parsed?.username || "unknown",
      // Never expose password or full connection string
    };
  } catch {
    checks.dbIdentity = { host: "parse-error", database: "parse-error" };
  }

  // 1. Database connectivity
  try {
    const start = Date.now();
    const result = await sql`SELECT 1 as ok, NOW() as server_time, current_database() as db_name`;
    checks.db = {
      ok: true,
      latency_ms: Date.now() - start,
      server_time: result.rows[0].server_time,
      current_database: result.rows[0].db_name,
    };
  } catch (e) {
    checks.db = { ok: false, error: (e as Error).message };
    errors.push(`DB: ${(e as Error).message}`);
  }

  // 2. Auth / session check
  try {
    const session = await getCurrentUser();
    checks.auth = session
      ? { ok: true, user_id: session.sub, username: session.username }
      : { ok: false, reason: "No valid session cookie" };
  } catch (e) {
    checks.auth = { ok: false, error: (e as Error).message };
    errors.push(`Auth: ${(e as Error).message}`);
  }

  // 3. Table row counts (quick check that data exists)
  const tables = ["users", "organizations", "submissions", "jury_assignments", "jury_votes", "disputes", "vault_entries", "arguments", "beliefs", "translations", "membership_applications", "di_requests", "audit_log"];
  checks.tables = {};
  for (const table of tables) {
    try {
      const result = await sql.query(`SELECT COUNT(*) as count FROM ${table}`);
      (checks.tables as Record<string, number>)[table] = parseInt(result.rows[0].count);
    } catch (e) {
      (checks.tables as Record<string, string>)[table] = `ERROR: ${(e as Error).message}`;
      errors.push(`Table ${table}: ${(e as Error).message}`);
    }
  }

  // 4. Check if the data endpoints work
  const endpoints = [
    { name: "submissions", query: `SELECT COUNT(*) as count FROM submissions` },
    { name: "users", query: `SELECT COUNT(*) as count FROM users` },
    { name: "orgs", query: `SELECT COUNT(*) as count FROM organizations` },
    { name: "pending_jury", query: `SELECT COUNT(*) as count FROM submissions WHERE status = 'pending_jury'` },
    { name: "pending_review", query: `SELECT COUNT(*) as count FROM submissions WHERE status = 'pending_review'` },
    { name: "di_pending", query: `SELECT COUNT(*) as count FROM submissions WHERE status = 'di_pending'` },
    { name: "approved", query: `SELECT COUNT(*) as count FROM submissions WHERE status = 'approved'` },
  ];
  checks.submission_statuses = {};
  for (const ep of endpoints) {
    try {
      const result = await sql.query(ep.query);
      (checks.submission_statuses as Record<string, number>)[ep.name] = parseInt(result.rows[0].count);
    } catch (e) {
      (checks.submission_statuses as Record<string, string>)[ep.name] = `ERROR: ${(e as Error).message}`;
    }
  }

  // 5. Check DI partnerships
  try {
    const diUsers = await sql`
      SELECT u.username, u.is_di, u.di_approved, partner.username AS partner
      FROM users u
      LEFT JOIN users partner ON partner.id = u.di_partner_id
      WHERE u.is_di = TRUE OR u.di_partner_id IS NOT NULL
    `;
    checks.di_partnerships = diUsers.rows.map(r => ({
      username: r.username,
      isDI: r.is_di,
      diApproved: r.di_approved,
      partner: r.partner,
    }));
  } catch (e) {
    checks.di_partnerships = `ERROR: ${(e as Error).message}`;
  }

  // 6. Check recent submissions (last 5)
  try {
    const recent = await sql`
      SELECT s.id, s.status, s.is_di, s.created_at, u.username AS submitter, o.name AS org
      FROM submissions s
      LEFT JOIN users u ON u.id = s.submitted_by
      LEFT JOIN organizations o ON o.id = s.org_id
      ORDER BY s.created_at DESC
      LIMIT 5
    `;
    checks.recent_submissions = recent.rows;
  } catch (e) {
    checks.recent_submissions = `ERROR: ${(e as Error).message}`;
  }

  // 7. List all usernames for cross-referencing with /api/data/users
  try {
    const allUsers = await sql`
      SELECT id, username, is_di, di_approved, created_at,
        (SELECT COUNT(*) FROM organization_members om WHERE om.user_id = users.id AND om.is_active = TRUE) AS org_count
      FROM users
      ORDER BY created_at ASC
    `;
    checks.all_usernames = allUsers.rows.map(r => ({
      id: r.id,
      username: r.username,
      isDI: r.is_di,
      orgCount: parseInt(r.org_count),
      createdAt: r.created_at,
    }));
  } catch (e) {
    checks.all_usernames = `ERROR: ${(e as Error).message}`;
  }

  // 8. Write-test: attempt INSERT+ROLLBACK on critical tables to diagnose write failures
  checks.writeTest = {};
  const writeTables = [
    {
      name: "organizations",
      sql: `INSERT INTO organizations (name, description, created_by) VALUES ('__write_test__', 'test', (SELECT id FROM users LIMIT 1)) RETURNING id`,
    },
    {
      name: "submissions",
      sql: `INSERT INTO submissions (submission_type, url, original_headline, reasoning, submitted_by, org_id) VALUES ('correction', 'http://test', 'test', 'test', (SELECT id FROM users LIMIT 1), (SELECT id FROM organizations LIMIT 1)) RETURNING id`,
    },
    {
      name: "stories",
      sql: `INSERT INTO stories (title, description, submitted_by, org_id) VALUES ('test story title', 'test description for the story that is long enough', (SELECT id FROM users LIMIT 1), (SELECT id FROM organizations LIMIT 1)) RETURNING id`,
    },
  ];
  for (const wt of writeTables) {
    try {
      const client = await sql.connect();
      try {
        await client.query("BEGIN");
        await client.query(wt.sql);
        await client.query("ROLLBACK");
        (checks.writeTest as Record<string, unknown>)[wt.name] = { ok: true };
      } catch (e) {
        await client.query("ROLLBACK");
        (checks.writeTest as Record<string, unknown>)[wt.name] = { ok: false, error: (e as Error).message };
        errors.push(`Write ${wt.name}: ${(e as Error).message}`);
      } finally {
        client.release();
      }
    } catch (e) {
      (checks.writeTest as Record<string, unknown>)[wt.name] = { ok: false, error: `connect failed: ${(e as Error).message}` };
      errors.push(`Write ${wt.name} connect: ${(e as Error).message}`);
    }
  }

  // 9. Schema check: verify critical columns exist
  checks.schemaCheck = {};
  const columnChecks = [
    { table: "organizations", column: "slug" },
    { table: "submissions", column: "slug" },
    { table: "submissions", column: "dispute_count" },
    { table: "stories", column: "slug" },
    { table: "jury_assignments", column: "story_id" },
    { table: "jury_votes", column: "story_id" },
    { table: "client_errors", column: "id" },
  ];
  for (const cc of columnChecks) {
    try {
      await sql.query(
        `SELECT ${cc.column} FROM ${cc.table} LIMIT 0`
      );
      (checks.schemaCheck as Record<string, unknown>)[`${cc.table}.${cc.column}`] = true;
    } catch (e) {
      (checks.schemaCheck as Record<string, unknown>)[`${cc.table}.${cc.column}`] = `MISSING: ${(e as Error).message}`;
      errors.push(`Schema ${cc.table}.${cc.column}: ${(e as Error).message}`);
    }
  }

  // 10. Recent client_errors (last 5 unresolved) — shows actual error messages
  try {
    const recentErrors = await sql`
      SELECT error_type, error_message, api_route, source_function, line_context, created_at
      FROM client_errors
      WHERE resolved = FALSE
      ORDER BY created_at DESC
      LIMIT 5
    `;
    checks.recentErrors = recentErrors.rows;
  } catch (e) {
    checks.recentErrors = `ERROR: ${(e as Error).message}`;
  }

  // 11. Stalled submission resolution diagnostic
  try {
    const stalledSubs = await sql`
      SELECT
        s.id, s.status, s.jury_seats, s.cross_group_jury_size,
        s.created_at, s.resolved_at,
        o.name AS org_name,
        (SELECT COUNT(*) FROM jury_votes jv WHERE jv.submission_id = s.id AND jv.role = 'in_group')::int AS in_group_votes,
        (SELECT COUNT(*) FROM jury_votes jv WHERE jv.submission_id = s.id AND jv.role = 'in_group' AND jv.approve = TRUE)::int AS in_group_approves,
        (SELECT COUNT(*) FROM jury_votes jv WHERE jv.submission_id = s.id AND jv.role = 'cross_group')::int AS cross_group_votes,
        (SELECT COUNT(*) FROM jury_votes jv WHERE jv.submission_id = s.id)::int AS total_votes,
        (SELECT COUNT(*) FROM jury_assignments ja WHERE ja.submission_id = s.id)::int AS jury_assignments
      FROM submissions s
      LEFT JOIN organizations o ON o.id = s.org_id
      WHERE s.status IN ('pending_review', 'cross_review')
      ORDER BY s.created_at DESC
      LIMIT 10
    `;
    checks.stalledSubmissions = stalledSubs.rows.map((s: Record<string, unknown>) => {
      const isCross = s.status === "cross_review";
      const expectedJurors = isCross
        ? ((s.cross_group_jury_size as number) || 3)
        : ((s.jury_seats as number) || 3);
      const majority = getMajority(expectedJurors);
      const approves = s.in_group_approves as number;
      const rejects = (s.in_group_votes as number) - approves;
      const shouldResolve = approves >= majority || rejects >= majority || (s.in_group_votes as number) >= expectedJurors;
      return {
        id: s.id,
        status: s.status,
        org_name: s.org_name,
        jury_seats: s.jury_seats,
        expectedJurors,
        majority,
        in_group_votes: s.in_group_votes,
        in_group_approves: approves,
        in_group_rejects: rejects,
        cross_group_votes: s.cross_group_votes,
        total_votes: s.total_votes,
        jury_assignments: s.jury_assignments,
        shouldResolve,
        whyNot: shouldResolve ? "SHOULD RESOLVE — check tryResolveSubmission errors" : `Need ${majority} votes for majority, have ${Math.max(approves, rejects)}`,
        created_at: s.created_at,
      };
    });
  } catch (e) {
    checks.stalledSubmissions = `ERROR: ${(e as Error).message}`;
  }

  // 12. Attempt reconciliation and report result
  try {
    const resolvedCount = await reconcileStalledSubmissions();
    checks.reconciliation = { ran: true, resolved: resolvedCount };
  } catch (e) {
    checks.reconciliation = { ran: false, error: (e as Error).message };
  }

  return ok({
    healthy: errors.length === 0,
    errors,
    checks,
    timestamp: new Date().toISOString(),
  });
}
