import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ok, err } from "@/lib/api-utils";

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

  return ok({
    healthy: errors.length === 0,
    errors,
    checks,
    timestamp: new Date().toISOString(),
  });
}
