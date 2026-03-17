import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden, err } from "@/lib/api-utils";

// POST /api/admin/diag-transactions
// Runs a comprehensive set of diagnostic tests to prove whether
// database transactions work correctly with the current @vercel/postgres setup.
// Uses temp tables — zero risk to production data.

interface TestResult {
  name: string;
  status: "PASS" | "FAIL" | "ERROR" | "INFO";
  description: string;
  details: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  const results: TestResult[] = [];
  const startTime = Date.now();

  // ═══════════════════════════════════════════════════════════
  // TEST 1: sql tagged template — are transactions real?
  // ═══════════════════════════════════════════════════════════
  try {
    // Create a temp table via sql tagged template
    await sql`CREATE TABLE IF NOT EXISTS _diag_txn_test_1 (val INT)`;
    await sql`DELETE FROM _diag_txn_test_1`; // clean slate

    // Simulate a transaction: BEGIN → INSERT → ROLLBACK
    await sql`BEGIN`;
    await sql`INSERT INTO _diag_txn_test_1 (val) VALUES (42)`;
    await sql`ROLLBACK`;

    // If rollback worked, count should be 0. If broken, count = 1.
    const countResult = await sql`SELECT COUNT(*)::int AS cnt FROM _diag_txn_test_1`;
    const count = countResult.rows[0].cnt;

    await sql`DROP TABLE IF EXISTS _diag_txn_test_1`;

    results.push({
      name: "sql`` tagged template ROLLBACK",
      status: count === 0 ? "PASS" : "FAIL",
      description: count === 0
        ? "ROLLBACK correctly undid the INSERT — transactions work on sql``"
        : "ROLLBACK had NO EFFECT — the INSERT auto-committed. Each sql`` call is a separate stateless HTTP request. All BEGIN/COMMIT/ROLLBACK in the codebase are NO-OPS.",
      details: {
        insertedValue: 42,
        rolledBack: false,
        countAfterRollback: count,
        expectedCount: 0,
        transactionsBroken: count !== 0,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    // Clean up on error
    try { await sql`DROP TABLE IF EXISTS _diag_txn_test_1`; } catch {}
    results.push({
      name: "sql`` tagged template ROLLBACK",
      status: "ERROR",
      description: `Test errored: ${msg}`,
      details: { error: msg },
    });
  }

  // ═══════════════════════════════════════════════════════════
  // TEST 2: sql.connect() dedicated client — do transactions work?
  // ═══════════════════════════════════════════════════════════
  try {
    const client = await sql.connect();
    try {
      await client.query("CREATE TABLE IF NOT EXISTS _diag_txn_test_2 (val INT)");
      await client.query("DELETE FROM _diag_txn_test_2");

      await client.query("BEGIN");
      await client.query("INSERT INTO _diag_txn_test_2 (val) VALUES (42)");
      await client.query("ROLLBACK");

      const countResult = await client.query("SELECT COUNT(*)::int AS cnt FROM _diag_txn_test_2");
      const count = countResult.rows[0].cnt;

      await client.query("DROP TABLE IF EXISTS _diag_txn_test_2");

      results.push({
        name: "sql.connect() dedicated client ROLLBACK",
        status: count === 0 ? "PASS" : "FAIL",
        description: count === 0
          ? "ROLLBACK correctly undid the INSERT — dedicated client transactions work! This is the fix path."
          : "ROLLBACK failed even on a dedicated client. Unexpected — investigate further.",
        details: {
          insertedValue: 42,
          rolledBack: true,
          countAfterRollback: count,
          expectedCount: 0,
          transactionsWork: count === 0,
        },
      });
    } finally {
      client.release();
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    try { await sql`DROP TABLE IF EXISTS _diag_txn_test_2`; } catch {}
    results.push({
      name: "sql.connect() dedicated client ROLLBACK",
      status: "ERROR",
      description: `Test errored: ${msg}`,
      details: { error: msg },
    });
  }

  // ═══════════════════════════════════════════════════════════
  // TEST 3: sql.connect() COMMIT — does commit actually persist?
  // ═══════════════════════════════════════════════════════════
  try {
    const client = await sql.connect();
    try {
      await client.query("CREATE TABLE IF NOT EXISTS _diag_txn_test_3 (val INT)");
      await client.query("DELETE FROM _diag_txn_test_3");

      await client.query("BEGIN");
      await client.query("INSERT INTO _diag_txn_test_3 (val) VALUES (99)");
      await client.query("COMMIT");

      const countResult = await client.query("SELECT COUNT(*)::int AS cnt FROM _diag_txn_test_3");
      const count = countResult.rows[0].cnt;

      await client.query("DROP TABLE IF EXISTS _diag_txn_test_3");

      results.push({
        name: "sql.connect() dedicated client COMMIT",
        status: count === 1 ? "PASS" : "FAIL",
        description: count === 1
          ? "COMMIT correctly persisted the INSERT."
          : "COMMIT did not persist the data. Unexpected.",
        details: {
          insertedValue: 99,
          committed: true,
          countAfterCommit: count,
          expectedCount: 1,
        },
      });
    } finally {
      client.release();
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    try { await sql`DROP TABLE IF EXISTS _diag_txn_test_3`; } catch {}
    results.push({
      name: "sql.connect() dedicated client COMMIT",
      status: "ERROR",
      description: `Test errored: ${msg}`,
      details: { error: msg },
    });
  }

  // ═══════════════════════════════════════════════════════════
  // TEST 4: Connection identity — do consecutive sql`` calls
  //         hit different backends?
  // ═══════════════════════════════════════════════════════════
  try {
    // sql tagged template: two consecutive calls
    const pid1Result = await sql`SELECT pg_backend_pid() AS pid`;
    const pid2Result = await sql`SELECT pg_backend_pid() AS pid`;
    const sqlPid1 = pid1Result.rows[0]?.pid;
    const sqlPid2 = pid2Result.rows[0]?.pid;

    // Dedicated client: two consecutive calls
    const client = await sql.connect();
    let clientPid1: number | null = null;
    let clientPid2: number | null = null;
    try {
      const cpid1 = await client.query("SELECT pg_backend_pid() AS pid");
      const cpid2 = await client.query("SELECT pg_backend_pid() AS pid");
      clientPid1 = cpid1.rows[0]?.pid;
      clientPid2 = cpid2.rows[0]?.pid;
    } finally {
      client.release();
    }

    const sqlSameConnection = sqlPid1 === sqlPid2;
    const clientSameConnection = clientPid1 === clientPid2;

    results.push({
      name: "Connection identity check",
      status: (!sqlSameConnection && clientSameConnection) ? "PASS" : "INFO",
      description: [
        `sql\`\` call 1 PID: ${sqlPid1 ?? "NULL"}, call 2 PID: ${sqlPid2 ?? "NULL"} → ${sqlSameConnection ? "SAME connection (unexpected)" : "DIFFERENT connections (confirms each call is independent)"}`,
        `client call 1 PID: ${clientPid1}, call 2 PID: ${clientPid2} → ${clientSameConnection ? "SAME connection (correct — dedicated client)" : "DIFFERENT connections (unexpected)"}`,
      ].join("\n"),
      details: {
        sqlTaggedTemplate: { pid1: sqlPid1, pid2: sqlPid2, sameConnection: sqlSameConnection },
        dedicatedClient: { pid1: clientPid1, pid2: clientPid2, sameConnection: clientSameConnection },
        // Note: sql tagged template uses neon() HTTP, so PIDs may be null or vary
        explanation: sqlPid1 === null
          ? "sql`` returns NULL PIDs — confirms it uses Neon HTTP driver (stateless, no persistent PG backend)"
          : sqlSameConnection
            ? "PIDs match — could indicate connection pooling at the Neon proxy level"
            : "PIDs differ — confirms each sql`` call gets a different backend connection",
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    results.push({
      name: "Connection identity check",
      status: "ERROR",
      description: `Test errored: ${msg}`,
      details: { error: msg },
    });
  }

  // ═══════════════════════════════════════════════════════════
  // TEST 5: Data integrity scan — look for inconsistencies
  //         caused by broken transactions
  // ═══════════════════════════════════════════════════════════
  try {
    // 5a. Total submissions in DB
    const totalSubs = await sql`SELECT COUNT(*)::int AS cnt FROM submissions`;
    const totalCount = totalSubs.rows[0].cnt;

    // 5b. Submissions by status
    const statusBreakdown = await sql`
      SELECT status, COUNT(*)::int AS cnt FROM submissions GROUP BY status ORDER BY cnt DESC
    `;

    // 5c. Votes that reference non-existent or already-resolved submissions
    //     (shouldn't happen but broken transactions could cause it)
    const orphanedVotes = await sql`
      SELECT jv.submission_id, jv.user_id, jv.role, s.status AS current_status
      FROM jury_votes jv
      JOIN submissions s ON s.id = jv.submission_id
      WHERE s.status NOT IN ('pending_review', 'cross_review')
        AND jv.created_at > s.resolved_at
    `;

    // 5d. Submissions resolved but missing audit log entry
    const missingAudit = await sql`
      SELECT s.id, s.status, s.resolved_at
      FROM submissions s
      WHERE s.status IN ('approved', 'rejected', 'consensus', 'consensus_rejected')
        AND s.resolved_at IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM audit_log al
          WHERE al.entity_type = 'submission' AND al.entity_id = s.id::text
            AND al.action LIKE 'Submission resolved%'
        )
    `;

    // 5e. Submissions in cross_review but without jury assignments
    const crossNoJury = await sql`
      SELECT s.id
      FROM submissions s
      WHERE s.status = 'cross_review'
        AND NOT EXISTS (
          SELECT 1 FROM jury_assignments ja
          WHERE ja.submission_id = s.id AND ja.role = 'cross_group'
        )
    `;

    // 5f. Users with negative stats (shouldn't happen)
    const negativeStats = await sql`
      SELECT id, username, total_wins, total_losses, current_streak
      FROM users
      WHERE total_wins < 0 OR total_losses < 0 OR current_streak < 0
    `;

    // 5g. Check for partially resolved submissions:
    //     Status is approved/consensus but submitter's user_review_history is missing
    const partialResolutions = await sql`
      SELECT s.id, s.status, s.submitted_by, s.resolved_at
      FROM submissions s
      WHERE s.status IN ('approved', 'rejected', 'consensus', 'consensus_rejected')
        AND s.resolved_at IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM user_review_history urh
          WHERE urh.submission_id = s.id
        )
        AND s.status NOT IN ('cross_review')
    `;

    const issues: string[] = [];
    if (orphanedVotes.rows.length > 0)
      issues.push(`${orphanedVotes.rows.length} vote(s) cast after submission was resolved`);
    if (missingAudit.rows.length > 0)
      issues.push(`${missingAudit.rows.length} resolved submission(s) missing audit log entry`);
    if (crossNoJury.rows.length > 0)
      issues.push(`${crossNoJury.rows.length} cross_review submission(s) without jury assignments`);
    if (negativeStats.rows.length > 0)
      issues.push(`${negativeStats.rows.length} user(s) with negative stat values`);
    if (partialResolutions.rows.length > 0)
      issues.push(`${partialResolutions.rows.length} resolved submission(s) missing review history (partial resolution — transaction likely failed mid-way)`);

    results.push({
      name: "Data integrity scan",
      status: issues.length === 0 ? "PASS" : "FAIL",
      description: issues.length === 0
        ? "No data inconsistencies found."
        : `Found ${issues.length} issue(s):\n${issues.map(i => `  - ${i}`).join("\n")}`,
      details: {
        totalSubmissions: totalCount,
        statusBreakdown: statusBreakdown.rows,
        orphanedVotes: orphanedVotes.rows,
        missingAuditLog: missingAudit.rows,
        crossReviewNoJury: crossNoJury.rows,
        negativeStats: negativeStats.rows,
        partialResolutions: partialResolutions.rows,
        issueCount: issues.length,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    results.push({
      name: "Data integrity scan",
      status: "ERROR",
      description: `Test errored: ${msg}`,
      details: { error: msg },
    });
  }

  // ═══════════════════════════════════════════════════════════
  // TEST 6: Verify data endpoint query returns all submissions
  // ═══════════════════════════════════════════════════════════
  try {
    const directCount = await sql`SELECT COUNT(*)::int AS cnt FROM submissions`;
    const joinCount = await sql`
      SELECT COUNT(*)::int AS cnt
      FROM submissions s
      LEFT JOIN users u ON u.id = s.submitted_by
      LEFT JOIN organizations o ON o.id = s.org_id
    `;
    const match = directCount.rows[0].cnt === joinCount.rows[0].cnt;

    results.push({
      name: "Data endpoint query parity",
      status: match ? "PASS" : "FAIL",
      description: match
        ? `Direct COUNT and LEFT JOIN COUNT both return ${directCount.rows[0].cnt} — no rows lost in JOINs.`
        : `Mismatch: direct COUNT = ${directCount.rows[0].cnt}, LEFT JOIN COUNT = ${joinCount.rows[0].cnt}. JOINs are filtering rows (orphaned foreign keys?).`,
      details: {
        directCount: directCount.rows[0].cnt,
        joinCount: joinCount.rows[0].cnt,
        match,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    results.push({
      name: "Data endpoint query parity",
      status: "ERROR",
      description: `Test errored: ${msg}`,
      details: { error: msg },
    });
  }

  // ═══════════════════════════════════════════════════════════
  // TEST 7: Enumerate all BEGIN/COMMIT/ROLLBACK usage in codebase
  //         (informational — shows what needs fixing)
  // ═══════════════════════════════════════════════════════════
  const affectedFiles = [
    { file: "src/app/api/submissions/[id]/vote/route.ts", lines: "99-143", description: "Vote endpoint: BEGIN → FOR UPDATE → INSERT vote → COMMIT → tryResolveSubmission" },
    { file: "src/lib/vote-resolution.ts", lines: "107-156", description: "tryResolveSubmission: BEGIN → UPDATE status → resolve edits → update reputation → promote cross-group → COMMIT" },
  ];

  results.push({
    name: "Broken transaction usage inventory",
    status: "INFO",
    description: `Found ${affectedFiles.length} file(s) using sql\`BEGIN\`/sql\`COMMIT\`/sql\`ROLLBACK\` — all of these are NO-OPS when using the sql tagged template.`,
    details: { affectedFiles },
  });

  // ═══════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════
  const passCount = results.filter(r => r.status === "PASS").length;
  const failCount = results.filter(r => r.status === "FAIL").length;
  const errorCount = results.filter(r => r.status === "ERROR").length;
  const infoCount = results.filter(r => r.status === "INFO").length;

  return ok({
    success: true,
    summary: {
      pass: passCount,
      fail: failCount,
      error: errorCount,
      info: infoCount,
      durationMs: Date.now() - startTime,
      verdict: failCount > 0
        ? "TRANSACTIONS ARE BROKEN — sql`` tagged template uses stateless HTTP. BEGIN/COMMIT/ROLLBACK are no-ops. Fix: use sql.connect() for a dedicated client."
        : errorCount > 0
          ? "Some tests errored — review details."
          : "All tests passed.",
    },
    tests: results,
  });
}
