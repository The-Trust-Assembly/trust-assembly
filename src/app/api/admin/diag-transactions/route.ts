import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden } from "@/lib/api-utils";

// POST /api/admin/diag-transactions
// Comprehensive diagnostic: proves whether transactions work, then
// traces every resolved submission through the full resolution pipeline
// to identify exactly which steps completed and which didn't.

interface TestResult {
  name: string;
  status: "PASS" | "FAIL" | "ERROR" | "INFO" | "WARN";
  description: string;
  rootCause?: string;
  remediation?: string;
  codeFixed?: boolean;
  details: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  const results: TestResult[] = [];
  const startTime = Date.now();

  // ═══════════════════════════════════════════════════════════════════
  // SECTION A: TRANSACTION MECHANISM TESTS
  // Prove whether the sql`` driver actually supports transactions
  // ═══════════════════════════════════════════════════════════════════

  // TEST 1: sql`` tagged template ROLLBACK
  try {
    await sql`CREATE TABLE IF NOT EXISTS _diag_txn_test_1 (val INT)`;
    await sql`DELETE FROM _diag_txn_test_1`;
    await sql`BEGIN`;
    await sql`INSERT INTO _diag_txn_test_1 (val) VALUES (42)`;
    await sql`ROLLBACK`;
    const countResult = await sql`SELECT COUNT(*)::int AS cnt FROM _diag_txn_test_1`;
    const count = countResult.rows[0].cnt;
    await sql`DROP TABLE IF EXISTS _diag_txn_test_1`;

    results.push({
      name: "sql`` ROLLBACK test",
      status: count === 0 ? "PASS" : "FAIL",
      description: count === 0
        ? "ROLLBACK correctly undid the INSERT. Transactions work on sql``."
        : "ROLLBACK had NO EFFECT. The INSERT auto-committed immediately. Each sql`` call creates an independent stateless HTTP connection via neon(). All BEGIN/COMMIT/ROLLBACK statements in the codebase using sql`` are complete no-ops.",
      rootCause: "The sql`` tagged template from @vercel/postgres uses the neon() HTTP driver. Each sql`` call creates an independent stateless HTTP request to the Neon proxy. There is no persistent connection, so BEGIN on one call and ROLLBACK on the next go to different connections.",
      remediation: "Use sql.connect() to get a dedicated pooled client. Then use client.query() for all SQL within the transaction. Call client.release() in a finally block.",
      codeFixed: true,
      details: { countAfterRollback: count, expected: 0, transactionsBroken: count !== 0 },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    try { await sql`DROP TABLE IF EXISTS _diag_txn_test_1`; } catch {}
    results.push({ name: "sql`` ROLLBACK test", status: "ERROR", description: `Test errored: ${msg}`, details: { error: msg } });
  }

  // TEST 2: sql.connect() dedicated client ROLLBACK
  try {
    const client = await sql.connect();
    try {
      await client.query("CREATE TABLE IF NOT EXISTS _diag_txn_test_2 (val INT)");
      await client.query("DELETE FROM _diag_txn_test_2");
      await client.query("BEGIN");
      await client.query("INSERT INTO _diag_txn_test_2 (val) VALUES (42)");
      await client.query("ROLLBACK");
      const r = await client.query("SELECT COUNT(*)::int AS cnt FROM _diag_txn_test_2");
      const count = r.rows[0].cnt;
      await client.query("DROP TABLE IF EXISTS _diag_txn_test_2");
      results.push({
        name: "sql.connect() ROLLBACK test",
        status: count === 0 ? "PASS" : "FAIL",
        description: count === 0
          ? "Dedicated client ROLLBACK works. This is the fix path — use sql.connect() for real transactions."
          : "ROLLBACK failed even on dedicated client. Unexpected.",
        details: { countAfterRollback: count, expected: 0, transactionsWork: count === 0 },
      });
    } finally { client.release(); }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    try { await sql`DROP TABLE IF EXISTS _diag_txn_test_2`; } catch {}
    results.push({ name: "sql.connect() ROLLBACK test", status: "ERROR", description: `Test errored: ${msg}`, details: { error: msg } });
  }

  // TEST 3: sql.connect() COMMIT
  try {
    const client = await sql.connect();
    try {
      await client.query("CREATE TABLE IF NOT EXISTS _diag_txn_test_3 (val INT)");
      await client.query("DELETE FROM _diag_txn_test_3");
      await client.query("BEGIN");
      await client.query("INSERT INTO _diag_txn_test_3 (val) VALUES (99)");
      await client.query("COMMIT");
      const r = await client.query("SELECT COUNT(*)::int AS cnt FROM _diag_txn_test_3");
      const count = r.rows[0].cnt;
      await client.query("DROP TABLE IF EXISTS _diag_txn_test_3");
      results.push({
        name: "sql.connect() COMMIT test",
        status: count === 1 ? "PASS" : "FAIL",
        description: count === 1 ? "Dedicated client COMMIT persists data correctly." : "COMMIT failed to persist. Unexpected.",
        details: { countAfterCommit: count, expected: 1 },
      });
    } finally { client.release(); }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    try { await sql`DROP TABLE IF EXISTS _diag_txn_test_3`; } catch {}
    results.push({ name: "sql.connect() COMMIT test", status: "ERROR", description: `Test errored: ${msg}`, details: { error: msg } });
  }

  // TEST 4: Connection identity
  try {
    const pid1 = (await sql`SELECT pg_backend_pid() AS pid`).rows[0]?.pid;
    const pid2 = (await sql`SELECT pg_backend_pid() AS pid`).rows[0]?.pid;
    const client = await sql.connect();
    let cpid1: number | null = null, cpid2: number | null = null;
    try {
      cpid1 = (await client.query("SELECT pg_backend_pid() AS pid")).rows[0]?.pid;
      cpid2 = (await client.query("SELECT pg_backend_pid() AS pid")).rows[0]?.pid;
    } finally { client.release(); }

    const sqlSame = pid1 === pid2;
    const clientSame = cpid1 === cpid2;
    results.push({
      name: "Connection identity (pg_backend_pid)",
      status: (!sqlSame && clientSame) ? "PASS" : (pid1 === null ? "PASS" : "INFO"),
      description: [
        `sql\`\`: PID ${pid1 ?? "NULL"} → ${pid2 ?? "NULL"} ${pid1 === null ? "(NULL = HTTP mode, no persistent backend)" : sqlSame ? "(SAME — pooler reuse)" : "(DIFFERENT — independent connections)"}`,
        `client: PID ${cpid1} → ${cpid2} ${clientSame ? "(SAME — dedicated connection confirmed)" : "(DIFFERENT — unexpected!)"}`,
      ].join("\n"),
      details: { sql: { pid1, pid2, same: sqlSame }, client: { pid1: cpid1, pid2: cpid2, same: clientSame } },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    results.push({ name: "Connection identity", status: "ERROR", description: `Test errored: ${msg}`, details: { error: msg } });
  }

  // ═══════════════════════════════════════════════════════════════════
  // SECTION B: PER-SUBMISSION RESOLUTION PIPELINE AUDIT
  // For every resolved submission, check every downstream table
  // that tryResolveSubmission should have written to.
  // ═══════════════════════════════════════════════════════════════════

  try {
    // Get ALL submissions with their resolution-relevant data
    const allSubs = await sql`
      SELECT
        s.id, s.status, s.submitted_by, s.org_id, s.is_di, s.di_partner_id,
        s.resolved_at, s.deliberate_lie_finding, s.jury_seats, s.cross_group_jury_size,
        s.cross_group_seed, s.created_at,
        u.username AS submitter_username,
        o.name AS org_name
      FROM submissions s
      LEFT JOIN users u ON u.id = s.submitted_by
      LEFT JOIN organizations o ON o.id = s.org_id
      ORDER BY s.created_at ASC
    `;

    const terminalStatuses = ["approved", "rejected", "consensus", "consensus_rejected"];

    // Batch-load all related data for efficiency
    // Use sql.query() with $1 params because sql`` tagged template doesn't accept arrays
    const subIds = allSubs.rows.map((s: Record<string, unknown>) => s.id) as string[];

    const [
      allVotes, allAuditLogs, allReviewHistory, allRatings,
      allInlineEdits, allLinkedEntries, allJuryAssignments, allCrossResults,
    ] = await Promise.all([
      sql.query(`SELECT submission_id, user_id, role, approve, deliberate_lie, newsworthy, interesting, voted_at
          FROM jury_votes WHERE submission_id = ANY($1)`, [subIds]),
      sql.query(`SELECT entity_id::text AS entity_id, action, user_id, metadata, created_at
          FROM audit_log WHERE entity_type = 'submission' AND entity_id = ANY($1)`, [subIds]),
      sql.query(`SELECT submission_id, user_id, outcome, from_di
          FROM user_review_history WHERE submission_id = ANY($1)`, [subIds]),
      sql.query(`SELECT submission_id, user_id, rated_by, newsworthy, interesting
          FROM user_ratings WHERE submission_id = ANY($1)`, [subIds]),
      sql.query(`SELECT submission_id, id, approved
          FROM submission_inline_edits WHERE submission_id = ANY($1)`, [subIds]),
      sql.query(`SELECT submission_id, entry_type, entry_id
          FROM submission_linked_entries WHERE submission_id = ANY($1)`, [subIds]),
      sql.query(`SELECT submission_id, user_id, role, in_pool, accepted
          FROM jury_assignments WHERE submission_id = ANY($1)`, [subIds]),
      sql.query(`SELECT submission_id, org_id, outcome, jury_size, was_lie
          FROM cross_group_results WHERE submission_id = ANY($1)`, [subIds]),
    ]);

    // Also load user stats for submitters to check reputation
    const submitterIds = [...new Set(allSubs.rows.map((s: Record<string, unknown>) => {
      return (s.is_di && s.di_partner_id) ? s.di_partner_id : s.submitted_by;
    }))];
    const userStats = await sql.query(`
      SELECT id, username, total_wins, total_losses, current_streak, deliberate_lies, last_deception_finding
      FROM users WHERE id = ANY($1)`, [submitterIds as string[]]);
    const userStatsMap: Record<string, Record<string, unknown>> = {};
    for (const u of userStats.rows) userStatsMap[u.id as string] = u;

    // Also load org member streaks
    const orgMemberStreaks = await sql.query(`
      SELECT org_id, user_id, assembly_streak
      FROM organization_members WHERE user_id = ANY($1) AND is_active = TRUE
    `, [submitterIds as string[]]);

    // Index everything by submission_id
    function indexBy<T extends Record<string, unknown>>(rows: T[], key: string): Record<string, T[]> {
      const map: Record<string, T[]> = {};
      for (const row of rows) {
        const k = String(row[key]);
        if (!map[k]) map[k] = [];
        map[k].push(row);
      }
      return map;
    }
    const votesMap = indexBy(allVotes.rows, "submission_id");
    const auditMap = indexBy(allAuditLogs.rows, "entity_id");
    const reviewMap = indexBy(allReviewHistory.rows, "submission_id");
    const ratingsMap = indexBy(allRatings.rows, "submission_id");
    const editsMap = indexBy(allInlineEdits.rows, "submission_id");
    const linkedMap = indexBy(allLinkedEntries.rows, "submission_id");
    const juryMap = indexBy(allJuryAssignments.rows, "submission_id");
    const crossMap = indexBy(allCrossResults.rows, "submission_id");
    const streakMap: Record<string, Record<string, unknown>> = {};
    for (const s of orgMemberStreaks.rows) streakMap[`${s.org_id}:${s.user_id}`] = s;

    // ── Audit each submission ──
    interface SubmissionAudit {
      id: string;
      status: string;
      submitter: string;
      org: string;
      createdAt: string;
      resolvedAt: string | null;
      pipelineSteps: PipelineStep[];
      issues: string[];
      issueCount: number;
    }

    interface PipelineStep {
      step: string;
      status: "OK" | "MISSING" | "SKIPPED" | "N/A" | "WARN";
      expected: string;
      actual: string;
    }

    const submissionAudits: SubmissionAudit[] = [];
    let totalIssueCount = 0;

    for (const sub of allSubs.rows) {
      const sid = sub.id as string;
      const status = sub.status as string;
      const targetUserId = (sub.is_di && sub.di_partner_id) ? sub.di_partner_id as string : sub.submitted_by as string;
      const isResolved = terminalStatuses.includes(status);
      const isCrossReview = status === "cross_review";
      const isPending = status === "pending_review" || status === "pending_jury";
      const isApproved = status === "approved" || status === "consensus";
      const isRejected = status === "rejected" || status === "consensus_rejected";
      const isCrossOutcome = status === "consensus" || status === "consensus_rejected";

      const votes = votesMap[sid] || [];
      const audits = auditMap[sid] || [];
      const reviews = reviewMap[sid] || [];
      const ratings = ratingsMap[sid] || [];
      const edits = editsMap[sid] || [];
      const linked = linkedMap[sid] || [];
      const jury = juryMap[sid] || [];
      const cross = crossMap[sid] || [];

      const steps: PipelineStep[] = [];
      const issues: string[] = [];

      // ── STEP 1: Votes exist ──
      const inGroupVotes = votes.filter(v => v.role === "in_group");
      const crossVotes = votes.filter(v => v.role === "cross_group");
      if (isResolved || isCrossReview) {
        if (inGroupVotes.length === 0) {
          steps.push({ step: "In-group votes", status: "MISSING", expected: "At least 1 vote", actual: "0 votes" });
          issues.push("No in-group votes found for resolved/cross_review submission");
        } else {
          const approves = inGroupVotes.filter(v => v.approve).length;
          const rejects = inGroupVotes.length - approves;
          steps.push({ step: "In-group votes", status: "OK", expected: `>= majority of ${sub.jury_seats || 3}`, actual: `${inGroupVotes.length} votes (${approves} approve, ${rejects} reject)` });
        }
      }
      if (isCrossOutcome) {
        if (crossVotes.length === 0) {
          steps.push({ step: "Cross-group votes", status: "MISSING", expected: "At least 1 cross-group vote", actual: "0 votes" });
          issues.push("No cross-group votes found for consensus/consensus_rejected submission");
        } else {
          const approves = crossVotes.filter(v => v.approve).length;
          steps.push({ step: "Cross-group votes", status: "OK", expected: `>= majority of ${sub.cross_group_jury_size || 3}`, actual: `${crossVotes.length} votes (${approves} approve, ${crossVotes.length - approves} reject)` });
        }
      }
      if (isCrossReview) {
        if (crossVotes.length === 0) {
          steps.push({ step: "Cross-group votes (in progress)", status: "N/A", expected: "Awaiting votes", actual: `${crossVotes.length} votes so far` });
        } else {
          steps.push({ step: "Cross-group votes (in progress)", status: "OK", expected: "Awaiting more votes", actual: `${crossVotes.length} votes so far` });
        }
      }

      // ── STEP 2: resolved_at set ──
      if (isResolved) {
        if (!sub.resolved_at) {
          steps.push({ step: "resolved_at timestamp", status: "MISSING", expected: "Non-null timestamp", actual: "NULL" });
          issues.push("Submission is resolved but resolved_at is NULL");
        } else {
          steps.push({ step: "resolved_at timestamp", status: "OK", expected: "Non-null timestamp", actual: String(sub.resolved_at) });
        }
      }

      // ── STEP 3: Audit log entry ──
      if (isResolved) {
        const resolutionAudit = audits.find(a => (a.action as string).startsWith("Submission resolved"));
        if (!resolutionAudit) {
          steps.push({ step: "Audit log: resolution", status: "MISSING", expected: "audit_log entry 'Submission resolved: ...'", actual: "No matching audit entry" });
          issues.push("Missing audit log entry for resolution — tryResolveSubmission likely failed after updating status but before writing audit log");
        } else {
          steps.push({ step: "Audit log: resolution", status: "OK", expected: "audit_log entry", actual: resolutionAudit.action as string });
        }
      }

      // ── STEP 4: user_review_history entry (in-group only) ──
      if (isResolved && !isCrossOutcome) {
        if (reviews.length === 0) {
          steps.push({ step: "user_review_history", status: "MISSING", expected: "1 row for submitter", actual: "0 rows" });
          issues.push("Missing user_review_history — updateSubmitterReputation likely failed or was skipped");
        } else {
          const review = reviews[0];
          const outcomeMatch = review.outcome === status;
          steps.push({
            step: "user_review_history",
            status: outcomeMatch ? "OK" : "WARN",
            expected: `outcome = ${status}`,
            actual: `outcome = ${review.outcome}${!outcomeMatch ? " (MISMATCH)" : ""}`,
          });
          if (!outcomeMatch) issues.push(`user_review_history outcome "${review.outcome}" doesn't match submission status "${status}"`);
        }
      }

      // ── STEP 5: User ratings stored ──
      if (isResolved && !isCrossOutcome) {
        const votesWithRatings = inGroupVotes.filter(v => v.newsworthy !== null && v.interesting !== null);
        if (votesWithRatings.length > 0) {
          if (ratings.length === 0) {
            steps.push({ step: "user_ratings", status: "MISSING", expected: `${votesWithRatings.length} rating(s) from votes with ratings`, actual: "0 ratings stored" });
            issues.push(`${votesWithRatings.length} vote(s) had newsworthy+interesting ratings but no user_ratings rows were stored`);
          } else if (ratings.length < votesWithRatings.length) {
            steps.push({ step: "user_ratings", status: "WARN", expected: `${votesWithRatings.length} rating(s)`, actual: `${ratings.length} rating(s) — some missing` });
            issues.push(`Only ${ratings.length} of ${votesWithRatings.length} expected user_ratings rows exist`);
          } else {
            steps.push({ step: "user_ratings", status: "OK", expected: `${votesWithRatings.length} rating(s)`, actual: `${ratings.length} rating(s)` });
          }
        } else {
          steps.push({ step: "user_ratings", status: "N/A", expected: "No votes had ratings", actual: "Skipped (no ratings data in votes)" });
        }
      }

      // ── STEP 6: Inline edits resolved ──
      if (isResolved) {
        if (edits.length > 0) {
          const unresolvedEdits = edits.filter(e => e.approved === null);
          if (unresolvedEdits.length > 0) {
            steps.push({ step: "Inline edits resolved", status: "MISSING", expected: `All ${edits.length} edits have approved set`, actual: `${unresolvedEdits.length} edit(s) still have approved=NULL` });
            issues.push(`${unresolvedEdits.length} inline edit(s) were not resolved — resolveInlineEdits likely failed`);
          } else {
            steps.push({ step: "Inline edits resolved", status: "OK", expected: "All edits resolved", actual: `${edits.length} edit(s), all have approved set` });
          }
        } else {
          steps.push({ step: "Inline edits resolved", status: "N/A", expected: "No inline edits", actual: "0 edits" });
        }
      }

      // ── STEP 7: Linked vault entries graduated (approved only) ──
      if (isApproved) {
        if (linked.length > 0) {
          // Check if vault entries were graduated
          const vaultTableMap: Record<string, string> = { vault: "vault_entries", correction: "vault_entries", argument: "arguments", belief: "beliefs", translation: "translations" };
          const linkedTables = [...new Set(linked.map(l => vaultTableMap[l.entry_type as string]).filter(Boolean))];
          steps.push({ step: "Linked vault entries", status: "OK", expected: "Entries linked", actual: `${linked.length} linked entry(ies) across ${linkedTables.join(", ")}` });
        } else {
          steps.push({ step: "Linked vault entries", status: "N/A", expected: "No linked entries", actual: "0 linked" });
        }
      }

      // ── STEP 8: Cross-group promotion (in-group approved only) ──
      if (status === "approved") {
        // An approved submission may or may not have been promoted to cross-group
        // If promoted, status would have changed to cross_review — but since status is "approved",
        // it means either promotion was skipped (not enough orgs) or it failed
        const promoAudit = audits.find(a => (a.action as string).includes("Promoted to cross-group"));
        if (promoAudit) {
          steps.push({ step: "Cross-group promotion audit", status: "OK", expected: "Promotion logged", actual: promoAudit.action as string });
        } else {
          // This is fine — promotion is optional (requires qualifying orgs)
          steps.push({ step: "Cross-group promotion audit", status: "N/A", expected: "Optional — depends on qualifying orgs", actual: "No promotion audit entry (likely no qualifying orgs or <3 jurors available)" });
        }
      }
      if (isCrossReview) {
        // Was promoted — check jury assignments exist
        const crossAssignments = jury.filter(j => j.role === "cross_group");
        if (crossAssignments.length === 0) {
          steps.push({ step: "Cross-group jury assignments", status: "MISSING", expected: "At least 3 cross-group jurors", actual: "0 assignments" });
          issues.push("Submission is in cross_review but has no cross-group jury assignments — promoteToCrossGroup partially failed");
        } else {
          steps.push({ step: "Cross-group jury assignments", status: "OK", expected: ">= 3 jurors", actual: `${crossAssignments.length} assignment(s)` });
        }
      }

      // ── STEP 9: Cross-group results recorded ──
      if (isCrossOutcome) {
        if (cross.length === 0) {
          steps.push({ step: "cross_group_results", status: "MISSING", expected: "1 row", actual: "0 rows" });
          issues.push("Missing cross_group_results entry — recordCrossGroupResult likely failed");
        } else {
          steps.push({ step: "cross_group_results", status: "OK", expected: "1 row", actual: `outcome=${cross[0].outcome}, was_lie=${cross[0].was_lie}` });
        }
      }

      // ── STEP 10: Vote endpoint audit log (every vote should have one) ──
      const voteAudits = audits.filter(a => (a.action as string) === "Vote cast");
      const totalVotes = votes.length;
      if (totalVotes > 0) {
        if (voteAudits.length < totalVotes) {
          steps.push({ step: "Vote cast audit logs", status: "WARN", expected: `${totalVotes} 'Vote cast' entries (1 per vote)`, actual: `${voteAudits.length} entries` });
          if (voteAudits.length === 0) {
            issues.push(`All ${totalVotes} vote(s) missing 'Vote cast' audit entries — vote endpoint's audit INSERT likely failed on every vote (broken transaction)`)
          } else {
            issues.push(`${totalVotes - voteAudits.length} vote(s) missing 'Vote cast' audit entries — some vote endpoint transactions partially failed`);
          }
        } else {
          steps.push({ step: "Vote cast audit logs", status: "OK", expected: `${totalVotes} entries`, actual: `${voteAudits.length} entries` });
        }
      }

      // Only include detailed audits for resolved or problematic submissions
      if (isResolved || isCrossReview || issues.length > 0) {
        totalIssueCount += issues.length;
        submissionAudits.push({
          id: sid,
          status,
          submitter: `@${sub.submitter_username || "unknown"} (${targetUserId})`,
          org: sub.org_name as string || sub.org_id as string,
          createdAt: sub.created_at as string,
          resolvedAt: sub.resolved_at as string | null,
          pipelineSteps: steps,
          issues,
          issueCount: issues.length,
        });
      }
    }

    // Sort: submissions with issues first
    submissionAudits.sort((a, b) => b.issueCount - a.issueCount);

    const subsWithIssues = submissionAudits.filter(a => a.issueCount > 0);

    results.push({
      name: "Per-submission resolution pipeline audit",
      status: totalIssueCount === 0 ? "PASS" : "FAIL",
      description: totalIssueCount === 0
        ? `All ${submissionAudits.length} resolved/active submissions have complete pipeline state.`
        : `Found ${totalIssueCount} issue(s) across ${subsWithIssues.length} submission(s). ${submissionAudits.length - subsWithIssues.length} submission(s) are clean.`,
      rootCause: "tryResolveSubmission (src/lib/vote-resolution.ts) wrapped 15+ SQL writes in sql`` BEGIN/COMMIT which were no-ops. Each write auto-committed independently. When any step threw an error, prior steps were already permanent and ROLLBACK was a no-op. Common failure: status UPDATE succeeded but audit_log INSERT, user_review_history, and user_ratings all failed.",
      remediation: "CODE FIX APPLIED: vote-resolution.ts now uses sql.connect() for a dedicated client. All resolution steps run within a real BEGIN/COMMIT/ROLLBACK transaction. DATA REPAIR NEEDED: Existing submissions with missing audit_log, user_review_history, and user_ratings rows need backfill. Run this diagnostic after deploying the code fix — new submissions should show 0 issues.",
      codeFixed: true,
      details: {
        totalAudited: submissionAudits.length,
        withIssues: subsWithIssues.length,
        totalIssues: totalIssueCount,
        submissions: submissionAudits,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    results.push({
      name: "Per-submission resolution pipeline audit",
      status: "ERROR",
      description: `Pipeline audit errored: ${msg}`,
      details: { error: msg, stack: e instanceof Error ? e.stack : undefined },
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // SECTION C: VOTE-LEVEL FORENSICS
  // For each vote, check if the user likely got a 500 error
  // (vote exists but no audit log, or vote timestamp >> resolution timestamp)
  // ═══════════════════════════════════════════════════════════════════

  try {
    // Find votes where the "Vote cast" audit log is missing
    const ghostVotes = await sql`
      SELECT
        jv.submission_id, jv.user_id, jv.role, jv.approve, jv.voted_at,
        u.username,
        s.status AS sub_status, s.resolved_at
      FROM jury_votes jv
      JOIN users u ON u.id = jv.user_id
      JOIN submissions s ON s.id = jv.submission_id
      WHERE NOT EXISTS (
        SELECT 1 FROM audit_log al
        WHERE al.entity_type = 'submission'
          AND al.entity_id = jv.submission_id
          AND al.action = 'Vote cast'
          AND al.user_id = jv.user_id
      )
      ORDER BY jv.voted_at DESC
    `;

    // Find votes cast after resolution (race condition evidence)
    const postResolutionVotes = await sql`
      SELECT
        jv.submission_id, jv.user_id, jv.role, jv.approve, jv.voted_at,
        u.username,
        s.status AS sub_status, s.resolved_at
      FROM jury_votes jv
      JOIN users u ON u.id = jv.user_id
      JOIN submissions s ON s.id = jv.submission_id
      WHERE s.resolved_at IS NOT NULL
        AND jv.voted_at > s.resolved_at
      ORDER BY jv.voted_at DESC
    `;

    // Find duplicate votes (same user, same submission, same role)
    const dupeVotes = await sql`
      SELECT submission_id, user_id, role, COUNT(*)::int AS vote_count
      FROM jury_votes
      GROUP BY submission_id, user_id, role
      HAVING COUNT(*) > 1
    `;

    const ghostCount = ghostVotes.rows.length;
    const postResCount = postResolutionVotes.rows.length;
    const dupeCount = dupeVotes.rows.length;
    const voteIssues: string[] = [];

    if (ghostCount > 0) voteIssues.push(`${ghostCount} vote(s) saved to DB but missing "Vote cast" audit log — these users likely received a 500 error despite their vote being recorded`);
    if (postResCount > 0) voteIssues.push(`${postResCount} vote(s) cast after the submission was already resolved — race condition (broken FOR UPDATE lock)`);
    if (dupeCount > 0) voteIssues.push(`${dupeCount} duplicate vote(s) found — same user voted twice on same submission with same role (broken dupe check)`);

    results.push({
      name: "Vote-level forensics",
      status: voteIssues.length === 0 ? "PASS" : "FAIL",
      description: voteIssues.length === 0
        ? "All votes have matching audit logs, none are post-resolution, no duplicates."
        : `Found vote-level issues:\n${voteIssues.map(i => `  - ${i}`).join("\n")}`,
      rootCause: "Vote endpoint (src/app/api/submissions/[id]/vote/route.ts) used sql`` for BEGIN/FOR UPDATE/INSERT vote/INSERT audit/COMMIT. Each sql`` call was independent: vote INSERT auto-committed immediately, FOR UPDATE lock was on a different connection (no-op), and if audit INSERT failed the vote was already saved. User received 500 error but their vote persisted.",
      remediation: "CODE FIX APPLIED: Vote endpoint now uses sql.connect() for a dedicated client. FOR UPDATE lock, dupe check, vote INSERT, and audit INSERT all run on the same connection within a real transaction. Ghost votes (vote saved, no audit) are historical damage. Post-resolution votes indicate race conditions from the broken FOR UPDATE lock. Duplicate votes indicate the dupe check ran on a different connection than the INSERT.",
      codeFixed: true,
      details: {
        ghostVotes: ghostVotes.rows.map(v => ({
          submission: v.submission_id, user: `@${v.username}`, role: v.role,
          approve: v.approve, votedAt: v.voted_at, subStatus: v.sub_status,
          diagnosis: "Vote was INSERT'd (auto-committed via broken sql``) but audit_log INSERT or subsequent COMMIT failed — user saw 500 error",
        })),
        postResolutionVotes: postResolutionVotes.rows.map(v => ({
          submission: v.submission_id, user: `@${v.username}`, role: v.role,
          votedAt: v.voted_at, resolvedAt: v.resolved_at,
          diagnosis: "SELECT FOR UPDATE was a no-op (separate HTTP connection), so this vote bypassed the lock",
        })),
        duplicateVotes: dupeVotes.rows,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    results.push({ name: "Vote-level forensics", status: "ERROR", description: `Errored: ${msg}`, details: { error: msg } });
  }

  // ═══════════════════════════════════════════════════════════════════
  // SECTION D: USER REPUTATION CONSISTENCY
  // Check if user win/loss/streak stats match what resolved submissions say
  // ═══════════════════════════════════════════════════════════════════

  try {
    // Calculate expected stats from submissions
    const expectedStats = await sql`
      WITH user_outcomes AS (
        SELECT
          CASE WHEN s.is_di AND s.di_partner_id IS NOT NULL THEN s.di_partner_id ELSE s.submitted_by END AS user_id,
          s.status,
          s.deliberate_lie_finding
        FROM submissions s
        WHERE s.status IN ('approved', 'consensus', 'rejected', 'consensus_rejected')
      )
      SELECT
        uo.user_id,
        u.username,
        COUNT(*) FILTER (WHERE uo.status IN ('approved', 'consensus')) AS expected_wins,
        COUNT(*) FILTER (WHERE uo.status IN ('rejected', 'consensus_rejected')) AS expected_losses,
        COUNT(*) FILTER (WHERE uo.deliberate_lie_finding = TRUE) AS expected_lies,
        u.total_wins AS actual_wins,
        u.total_losses AS actual_losses,
        u.deliberate_lies AS actual_lies
      FROM user_outcomes uo
      JOIN users u ON u.id = uo.user_id
      GROUP BY uo.user_id, u.username, u.total_wins, u.total_losses, u.deliberate_lies
    `;

    const mismatches = expectedStats.rows.filter(r =>
      Number(r.expected_wins) !== Number(r.actual_wins) ||
      Number(r.expected_losses) !== Number(r.actual_losses) ||
      Number(r.expected_lies) !== Number(r.actual_lies)
    );

    results.push({
      name: "User reputation consistency",
      status: mismatches.length === 0 ? "PASS" : "FAIL",
      description: mismatches.length === 0
        ? `All ${expectedStats.rows.length} user(s) with resolved submissions have correct win/loss/lie stats.`
        : `${mismatches.length} user(s) have reputation drift — stats don't match submission outcomes.`,
      rootCause: "updateSubmitterReputation in vote-resolution.ts updates users.total_wins/total_losses/deliberate_lies. Without real transactions, these could: (1) auto-commit even if later steps fail, (2) execute multiple times if resolution re-runs, (3) fail silently while submission status already changed.",
      remediation: "CODE FIX APPLIED: Reputation updates now run inside a real transaction via sql.connect(). If PASS, no data repair needed. If FAIL, compare expected (derived from submission outcomes) vs actual stats and write a backfill script to correct deltas.",
      codeFixed: true,
      details: {
        totalUsers: expectedStats.rows.length,
        mismatchCount: mismatches.length,
        mismatches: mismatches.map(r => ({
          user: `@${r.username}`,
          wins: { expected: Number(r.expected_wins), actual: Number(r.actual_wins), delta: Number(r.actual_wins) - Number(r.expected_wins) },
          losses: { expected: Number(r.expected_losses), actual: Number(r.actual_losses), delta: Number(r.actual_losses) - Number(r.expected_losses) },
          lies: { expected: Number(r.expected_lies), actual: Number(r.actual_lies), delta: Number(r.actual_lies) - Number(r.expected_lies) },
          diagnosis: "Reputation update in updateSubmitterReputation either ran multiple times (no transaction isolation) or failed (partial transaction commit)",
        })),
        allUsers: expectedStats.rows.map(r => ({
          user: `@${r.username}`, expectedWins: Number(r.expected_wins), actualWins: Number(r.actual_wins),
          expectedLosses: Number(r.expected_losses), actualLosses: Number(r.actual_losses),
          expectedLies: Number(r.expected_lies), actualLies: Number(r.actual_lies),
        })),
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    results.push({ name: "User reputation consistency", status: "ERROR", description: `Errored: ${msg}`, details: { error: msg } });
  }

  // ═══════════════════════════════════════════════════════════════════
  // SECTION E: USER REGISTRATION & ORG MEMBERSHIP CONSISTENCY
  // Check every user has proper org memberships and primary_org_id set
  // ═══════════════════════════════════════════════════════════════════

  try {
    // Users without any org membership
    const noOrgUsers = await sql`
      SELECT u.id, u.username, u.created_at
      FROM users u
      WHERE NOT EXISTS (
        SELECT 1 FROM organization_members om WHERE om.user_id = u.id
      )
    `;

    // Users with primary_org_id set but no active membership in that org
    const orphanedPrimaryOrg = await sql`
      SELECT u.id, u.username, u.primary_org_id, o.name AS org_name
      FROM users u
      LEFT JOIN organizations o ON o.id = u.primary_org_id
      WHERE u.primary_org_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM organization_members om
          WHERE om.user_id = u.id AND om.org_id = u.primary_org_id AND om.is_active = TRUE
        )
    `;

    // Users with active memberships but NULL primary_org_id
    const nullPrimaryOrg = await sql`
      SELECT u.id, u.username, COUNT(om.id)::int AS active_memberships
      FROM users u
      JOIN organization_members om ON om.user_id = u.id AND om.is_active = TRUE
      WHERE u.primary_org_id IS NULL
      GROUP BY u.id, u.username
    `;

    // Org membership history gaps (member rows without matching history entry)
    const missingHistory = await sql`
      SELECT om.id, om.user_id, om.org_id, u.username, o.name AS org_name
      FROM organization_members om
      JOIN users u ON u.id = om.user_id
      JOIN organizations o ON o.id = om.org_id
      WHERE NOT EXISTS (
        SELECT 1 FROM organization_member_history omh
        WHERE omh.user_id = om.user_id AND omh.org_id = om.org_id
      )
    `;

    const enrollIssues: string[] = [];
    if (noOrgUsers.rows.length > 0) enrollIssues.push(`${noOrgUsers.rows.length} user(s) have zero org memberships — registration INSERT into organization_members likely failed`);
    if (orphanedPrimaryOrg.rows.length > 0) enrollIssues.push(`${orphanedPrimaryOrg.rows.length} user(s) have primary_org_id pointing to an org they're not active in`);
    if (nullPrimaryOrg.rows.length > 0) enrollIssues.push(`${nullPrimaryOrg.rows.length} user(s) have active org memberships but NULL primary_org_id — UPDATE users SET primary_org_id likely failed during registration`);

    results.push({
      name: "User registration & org membership",
      status: enrollIssues.length === 0 ? "PASS" : "FAIL",
      description: enrollIssues.length === 0
        ? "All users have org memberships and consistent primary_org_id."
        : `Found ${enrollIssues.length} enrollment issue(s):\n${enrollIssues.map(i => `  - ${i}`).join("\n")}`,
      rootCause: "POST /auth/register (src/app/api/auth/register/route.ts) does: INSERT user → INSERT organization_members → UPDATE users SET primary_org_id. Three sequential sql`` calls with no transaction. If INSERT user succeeds but later steps fail, user exists without org membership or with NULL primary_org_id.",
      remediation: "CODE NOT YET FIXED. Needs sql.connect() transaction wrapping all 3 operations. DATA REPAIR: For nullPrimaryOrg users, UPDATE users SET primary_org_id = (SELECT org_id FROM organization_members WHERE user_id = users.id AND is_active = TRUE LIMIT 1) for each affected user.",
      codeFixed: false,
      details: {
        usersWithNoOrg: noOrgUsers.rows.map(u => ({ user: `@${u.username}`, createdAt: u.created_at })),
        orphanedPrimaryOrg: orphanedPrimaryOrg.rows.map(u => ({ user: `@${u.username}`, primaryOrg: u.org_name || u.primary_org_id })),
        nullPrimaryOrg: nullPrimaryOrg.rows.map(u => ({ user: `@${u.username}`, activeMemberships: u.active_memberships })),
        missingHistoryCount: missingHistory.rows.length,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    results.push({ name: "User registration & org membership", status: "ERROR", description: `Errored: ${msg}`, details: { error: msg } });
  }

  // ═══════════════════════════════════════════════════════════════════
  // SECTION F: DI PARTNERSHIP CONSISTENCY
  // Check that DI partnerships are symmetric and fully linked
  // ═══════════════════════════════════════════════════════════════════

  try {
    // DI users where is_di=TRUE but di_partner_id is NULL
    const diNoPartner = await sql`
      SELECT id, username FROM users WHERE is_di = TRUE AND di_partner_id IS NULL
    `;

    // DI users where di_partner_id points to a user that doesn't point back
    const asymmetricDI = await sql`
      SELECT
        u1.id AS di_id, u1.username AS di_user, u1.di_partner_id,
        u2.username AS partner_user, u2.di_partner_id AS partner_points_to
      FROM users u1
      JOIN users u2 ON u2.id = u1.di_partner_id
      WHERE u1.is_di = TRUE
        AND u1.di_partner_id IS NOT NULL
        AND (u2.di_partner_id IS NULL OR u2.di_partner_id != u1.id)
    `;

    // DI requests that are approved but users not linked
    const approvedNotLinked = await sql`
      SELECT dr.id, dr.di_user_id, dr.partner_user_id, dr.status,
        u1.username AS di_user, u1.di_partner_id AS di_actual_partner,
        u2.username AS partner_user, u2.di_partner_id AS partner_actual_partner
      FROM di_requests dr
      JOIN users u1 ON u1.id = dr.di_user_id
      JOIN users u2 ON u2.id = dr.partner_user_id
      WHERE dr.status = 'approved'
        AND (u1.di_partner_id != dr.partner_user_id OR u2.di_partner_id != dr.di_user_id
             OR u1.is_di != TRUE OR u1.di_approved != TRUE)
    `;

    // DI submissions without di_partner_id set
    const diSubsNoPartner = await sql`
      SELECT s.id, s.submitted_by, u.username
      FROM submissions s
      JOIN users u ON u.id = s.submitted_by
      WHERE s.is_di = TRUE AND s.di_partner_id IS NULL
    `;

    const diIssues: string[] = [];
    if (diNoPartner.rows.length > 0) diIssues.push(`${diNoPartner.rows.length} DI user(s) have is_di=TRUE but NULL di_partner_id — partnership setup failed`);
    if (asymmetricDI.rows.length > 0) diIssues.push(`${asymmetricDI.rows.length} DI partnership(s) are asymmetric — one side linked but the other isn't (partial UPDATE in /di-requests/[id] PATCH)`);
    if (approvedNotLinked.rows.length > 0) diIssues.push(`${approvedNotLinked.rows.length} approved DI request(s) but users not properly linked — di-request approved but user UPDATE failed`);
    if (diSubsNoPartner.rows.length > 0) diIssues.push(`${diSubsNoPartner.rows.length} DI submission(s) have is_di=TRUE but NULL di_partner_id`);

    results.push({
      name: "DI partnership consistency",
      status: diIssues.length === 0 ? "PASS" : "FAIL",
      description: diIssues.length === 0
        ? "All DI partnerships are symmetric and fully linked."
        : `Found ${diIssues.length} DI issue(s):\n${diIssues.map(i => `  - ${i}`).join("\n")}`,
      rootCause: "PATCH /di-requests/[id] (src/app/api/di-requests/[id]/route.ts) does: UPDATE di_requests status → UPDATE users (DI user) SET is_di, di_partner_id, di_approved → UPDATE users (partner) SET di_partner_id. Three sequential sql`` calls. If the first UPDATE succeeds but the second or third fails, partnership is asymmetric.",
      remediation: "CODE NOT YET FIXED. Needs sql.connect() transaction wrapping all 3 UPDATEs. DATA REPAIR: For asymmetric partnerships, identify which side is incomplete and run the missing UPDATE. For approvedNotLinked, re-run the user UPDATE statements from the PATCH endpoint.",
      codeFixed: false,
      details: {
        diNoPartner: diNoPartner.rows.map(u => ({ user: `@${u.username}` })),
        asymmetric: asymmetricDI.rows.map(r => ({
          diUser: `@${r.di_user}`, partnerUser: `@${r.partner_user}`,
          diPointsTo: r.di_partner_id, partnerPointsTo: r.partner_points_to,
          diagnosis: "One UPDATE in /di-requests/[id] PATCH succeeded, the other failed",
        })),
        approvedNotLinked: approvedNotLinked.rows.map(r => ({
          diUser: `@${r.di_user}`, partnerUser: `@${r.partner_user}`,
          requestStatus: r.status,
          diActualPartner: r.di_actual_partner, partnerActualPartner: r.partner_actual_partner,
        })),
        diSubsNoPartner: diSubsNoPartner.rows.map(r => ({ submission: r.id, user: `@${r.username}` })),
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    results.push({ name: "DI partnership consistency", status: "ERROR", description: `Errored: ${msg}`, details: { error: msg } });
  }

  // ═══════════════════════════════════════════════════════════════════
  // SECTION G: SUBMISSION CREATION CONSISTENCY
  // Every submission should have evidence, matching jury assignments, audit log
  // ═══════════════════════════════════════════════════════════════════

  try {
    // Submissions without any evidence
    const noEvidence = await sql`
      SELECT s.id, s.status, s.url, u.username, s.created_at
      FROM submissions s
      JOIN users u ON u.id = s.submitted_by
      WHERE NOT EXISTS (
        SELECT 1 FROM submission_evidence se WHERE se.submission_id = s.id
      )
    `;

    // Submissions that are pending_review but have no jury assignments
    const pendingNoJury = await sql`
      SELECT s.id, s.status, s.jury_seats, u.username, s.created_at
      FROM submissions s
      JOIN users u ON u.id = s.submitted_by
      WHERE s.status = 'pending_review'
        AND NOT EXISTS (
          SELECT 1 FROM jury_assignments ja WHERE ja.submission_id = s.id AND ja.role = 'in_group'
        )
    `;

    // Submissions without creation audit log
    const noCreateAudit = await sql`
      SELECT s.id, s.status, u.username
      FROM submissions s
      JOIN users u ON u.id = s.submitted_by
      WHERE NOT EXISTS (
        SELECT 1 FROM audit_log al
        WHERE al.entity_type = 'submission' AND al.entity_id = s.id
          AND (al.action LIKE 'Submission created%' OR al.action LIKE 'New submission%' OR al.action = 'Submitted correction')
      )
    `;

    // Jury assignments where the submission doesn't have enough jurors assigned
    const underAssigned = await sql`
      SELECT s.id, s.status, s.jury_seats,
        COUNT(ja.id)::int AS assigned_count
      FROM submissions s
      LEFT JOIN jury_assignments ja ON ja.submission_id = s.id AND ja.role = 'in_group'
      WHERE s.status = 'pending_review' AND s.jury_seats IS NOT NULL
      GROUP BY s.id, s.status, s.jury_seats
      HAVING COUNT(ja.id) < s.jury_seats
    `;

    // DI submissions in pending_di_review (awaiting partner approval) — check they have a partner
    const diPendingNoPartner = await sql`
      SELECT s.id, s.submitted_by, s.di_partner_id, u.username
      FROM submissions s
      JOIN users u ON u.id = s.submitted_by
      WHERE s.status = 'pending_di_review' AND s.di_partner_id IS NULL
    `;

    const subCreateIssues: string[] = [];
    if (noEvidence.rows.length > 0) subCreateIssues.push(`${noEvidence.rows.length} submission(s) have no evidence rows — evidence INSERT loop in /submissions POST failed`);
    if (pendingNoJury.rows.length > 0) subCreateIssues.push(`${pendingNoJury.rows.length} pending_review submission(s) have no in-group jury assignments — jury assignment loop failed`);
    if (noCreateAudit.rows.length > 0) subCreateIssues.push(`${noCreateAudit.rows.length} submission(s) missing creation audit log — audit INSERT failed after submission created`);
    if (underAssigned.rows.length > 0) subCreateIssues.push(`${underAssigned.rows.length} pending_review submission(s) have fewer jurors assigned than jury_seats — assignment loop partially failed`);
    if (diPendingNoPartner.rows.length > 0) subCreateIssues.push(`${diPendingNoPartner.rows.length} DI submission(s) pending partner review but have no di_partner_id`);

    results.push({
      name: "Submission creation consistency",
      status: subCreateIssues.length === 0 ? "PASS" : "FAIL",
      description: subCreateIssues.length === 0
        ? "All submissions have evidence, jury assignments, and audit logs."
        : `Found ${subCreateIssues.length} creation issue(s):\n${subCreateIssues.map(i => `  - ${i}`).join("\n")}`,
      rootCause: "POST /submissions (src/app/api/submissions/route.ts) does: INSERT submission → INSERT evidence (loop) → INSERT inline_edits (loop) → INSERT audit → UPDATE jury_seats → INSERT jury_assignments (loop). All sequential sql`` calls. The trusted_skip path has its own broken BEGIN/COMMIT wrapping auto-approve logic.",
      remediation: "CODE NOT YET FIXED. Needs sql.connect() transaction. DATA REPAIR: pendingNoJury submissions need jury re-assignment (re-run jury pool selection). noEvidence submissions may need manual review — the submission exists but evidence INSERT loop failed.",
      codeFixed: false,
      details: {
        noEvidence: noEvidence.rows.map(s => ({ id: s.id, status: s.status, user: `@${s.username}`, url: s.url })),
        pendingNoJury: pendingNoJury.rows.map(s => ({ id: s.id, seats: s.jury_seats, user: `@${s.username}`, createdAt: s.created_at })),
        noCreateAudit: noCreateAudit.rows.length,
        underAssigned: underAssigned.rows.map(s => ({ id: s.id, seats: s.jury_seats, assigned: s.assigned_count })),
        diPendingNoPartner: diPendingNoPartner.rows.map(s => ({ id: s.id, user: `@${s.username}` })),
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    results.push({ name: "Submission creation consistency", status: "ERROR", description: `Errored: ${msg}`, details: { error: msg } });
  }

  // ═══════════════════════════════════════════════════════════════════
  // SECTION H: DISPUTE & CONCESSION CONSISTENCY
  // ═══════════════════════════════════════════════════════════════════

  try {
    // Disputes without evidence
    const disputeNoEvidence = await sql`
      SELECT d.id, d.status, d.submission_id, u.username
      FROM disputes d
      JOIN users u ON u.id = d.disputed_by
      WHERE NOT EXISTS (
        SELECT 1 FROM dispute_evidence de WHERE de.dispute_id = d.id
      )
    `;

    // Disputes without audit log
    const disputeNoAudit = await sql`
      SELECT d.id, d.status, u.username
      FROM disputes d
      JOIN users u ON u.id = d.disputed_by
      WHERE NOT EXISTS (
        SELECT 1 FROM audit_log al
        WHERE al.entity_type = 'dispute' AND al.entity_id = d.id
      )
    `;

    // Dispute/concession votes without audit logs
    const disputeVotesNoAudit = await sql`
      SELECT jv.id, jv.dispute_id, jv.concession_id, jv.user_id, u.username, jv.voted_at
      FROM jury_votes jv
      JOIN users u ON u.id = jv.user_id
      WHERE (jv.dispute_id IS NOT NULL OR jv.concession_id IS NOT NULL)
        AND NOT EXISTS (
          SELECT 1 FROM audit_log al
          WHERE al.user_id = jv.user_id
            AND al.action = 'Vote cast'
            AND (
              (jv.dispute_id IS NOT NULL AND al.entity_type = 'dispute' AND al.entity_id = jv.dispute_id)
              OR (jv.concession_id IS NOT NULL AND al.entity_type = 'concession' AND al.entity_id = jv.concession_id)
            )
        )
    `;

    const disputeIssues: string[] = [];
    if (disputeNoEvidence.rows.length > 0) disputeIssues.push(`${disputeNoEvidence.rows.length} dispute(s) have no evidence — evidence INSERT loop failed`);
    if (disputeNoAudit.rows.length > 0) disputeIssues.push(`${disputeNoAudit.rows.length} dispute(s) missing audit log — audit INSERT failed`);
    if (disputeVotesNoAudit.rows.length > 0) disputeIssues.push(`${disputeVotesNoAudit.rows.length} dispute/concession vote(s) missing audit log`);

    results.push({
      name: "Dispute & concession consistency",
      status: disputeIssues.length === 0 ? "PASS" : "FAIL",
      description: disputeIssues.length === 0
        ? "All disputes have evidence, audit logs, and vote audit trails."
        : `Found ${disputeIssues.length} dispute issue(s):\n${disputeIssues.map(i => `  - ${i}`).join("\n")}`,
      rootCause: "POST /disputes does INSERT dispute → INSERT evidence (loop) → INSERT audit. POST /disputes/[id]/vote and /concessions/[id]/vote do INSERT vote → INSERT audit. All use sequential sql`` calls without transactions.",
      remediation: "CODE NOT YET FIXED. All 3 endpoints need sql.connect() transactions. Lower priority than vote resolution since disputes are less data-critical. Missing audit logs are cosmetic (data exists, just unlogged).",
      codeFixed: false,
      details: {
        disputeNoEvidence: disputeNoEvidence.rows.map(d => ({ id: d.id, status: d.status, user: `@${d.username}` })),
        disputeNoAudit: disputeNoAudit.rows.length,
        disputeVotesNoAudit: disputeVotesNoAudit.rows.map(v => ({ user: `@${v.username}`, disputeId: v.dispute_id, concessionId: v.concession_id, votedAt: v.voted_at })),
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    results.push({ name: "Dispute & concession consistency", status: "ERROR", description: `Errored: ${msg}`, details: { error: msg } });
  }

  // ═══════════════════════════════════════════════════════════════════
  // SECTION I: MEMBERSHIP APPLICATION CONSISTENCY
  // ═══════════════════════════════════════════════════════════════════

  try {
    // Approved applications where user is NOT an active member
    const approvedNotMember = await sql`
      SELECT ma.id, ma.user_id, ma.org_id, u.username, o.name AS org_name
      FROM membership_applications ma
      JOIN users u ON u.id = ma.user_id
      JOIN organizations o ON o.id = ma.org_id
      WHERE ma.status = 'approved'
        AND NOT EXISTS (
          SELECT 1 FROM organization_members om
          WHERE om.user_id = ma.user_id AND om.org_id = ma.org_id AND om.is_active = TRUE
        )
    `;

    // Active members with no matching application (for non-open-enrollment orgs)
    // This is less critical since direct join and admin actions don't create applications

    const appIssues: string[] = [];
    if (approvedNotMember.rows.length > 0) appIssues.push(`${approvedNotMember.rows.length} approved application(s) where user is NOT an active member — application PATCH approved the request but org_members INSERT/UPDATE failed`);

    results.push({
      name: "Membership application consistency",
      status: appIssues.length === 0 ? "PASS" : "FAIL",
      description: appIssues.length === 0
        ? "All approved applications have matching active org memberships."
        : `Found ${appIssues.length} application issue(s):\n${appIssues.map(i => `  - ${i}`).join("\n")}`,
      rootCause: "PATCH /orgs/[id]/applications/[appId] does UPDATE application SET status='approved' → INSERT/UPDATE organization_members → INSERT history. If application UPDATE succeeds but org_members INSERT fails, the application shows approved but user was never added to the org.",
      remediation: "CODE NOT YET FIXED. Needs sql.connect() transaction. DATA REPAIR: For each approvedNotMember, manually INSERT into organization_members (org_id, user_id, is_active=TRUE) and INSERT into organization_member_history.",
      codeFixed: false,
      details: {
        approvedNotMember: approvedNotMember.rows.map(a => ({
          user: `@${a.username}`, org: a.org_name,
          diagnosis: "PATCH /orgs/[id]/applications/[appId] — UPDATE application status succeeded but INSERT/UPDATE organization_members failed",
        })),
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    results.push({ name: "Membership application consistency", status: "ERROR", description: `Errored: ${msg}`, details: { error: msg } });
  }

  // ═══════════════════════════════════════════════════════════════════
  // SECTION J: VAULT / ARGUMENTS / BELIEFS / TRANSLATIONS CONSISTENCY
  // ═══════════════════════════════════════════════════════════════════

  try {
    // Vault entries linked to approved submissions but still in 'pending' status
    const stuckPendingVault = await sql`
      SELECT ve.id, ve.submission_id, ve.status AS vault_status, s.status AS sub_status, s.resolved_at
      FROM vault_entries ve
      JOIN submissions s ON s.id = ve.submission_id
      WHERE s.status IN ('approved', 'consensus')
        AND ve.status = 'pending'
    `;

    const stuckPendingArgs = await sql`
      SELECT a.id, a.submission_id, a.status AS arg_status, s.status AS sub_status
      FROM arguments a
      JOIN submissions s ON s.id = a.submission_id
      WHERE s.status IN ('approved', 'consensus')
        AND a.status = 'pending'
    `;

    const stuckPendingBeliefs = await sql`
      SELECT b.id, b.submission_id, b.status AS belief_status, s.status AS sub_status
      FROM beliefs b
      JOIN submissions s ON s.id = b.submission_id
      WHERE s.status IN ('approved', 'consensus')
        AND b.status = 'pending'
    `;

    const stuckPendingTranslations = await sql`
      SELECT t.id, t.submission_id, t.status AS trans_status, s.status AS sub_status
      FROM translations t
      JOIN submissions s ON s.id = t.submission_id
      WHERE s.status IN ('approved', 'consensus')
        AND t.status = 'pending'
    `;

    const totalStuck = stuckPendingVault.rows.length + stuckPendingArgs.rows.length +
                       stuckPendingBeliefs.rows.length + stuckPendingTranslations.rows.length;

    const vaultIssues: string[] = [];
    if (stuckPendingVault.rows.length > 0) vaultIssues.push(`${stuckPendingVault.rows.length} vault_entries still 'pending' despite approved submission — graduateLinkedVaultEntries failed`);
    if (stuckPendingArgs.rows.length > 0) vaultIssues.push(`${stuckPendingArgs.rows.length} arguments still 'pending' despite approved submission`);
    if (stuckPendingBeliefs.rows.length > 0) vaultIssues.push(`${stuckPendingBeliefs.rows.length} beliefs still 'pending' despite approved submission`);
    if (stuckPendingTranslations.rows.length > 0) vaultIssues.push(`${stuckPendingTranslations.rows.length} translations still 'pending' despite approved submission`);

    results.push({
      name: "Vault/arguments/beliefs/translations consistency",
      status: vaultIssues.length === 0 ? "PASS" : "FAIL",
      description: vaultIssues.length === 0
        ? "All vault entries linked to approved submissions have been graduated."
        : `Found ${totalStuck} stuck entry(ies):\n${vaultIssues.map(i => `  - ${i}`).join("\n")}`,
      rootCause: "graduateLinkedVaultEntries in vote-resolution.ts runs UPDATE vault_entries/arguments/beliefs/translations SET status='approved' WHERE submission_id=X AND status='pending'. If this step failed in the broken transaction, entries stay 'pending' forever despite the submission being approved.",
      remediation: "CODE FIX APPLIED (now inside real transaction). DATA REPAIR: For stuck entries, run: UPDATE vault_entries SET status='approved', approved_at=NOW() WHERE submission_id IN (SELECT id FROM submissions WHERE status IN ('approved','consensus')) AND status='pending'. Same for arguments, beliefs, translations tables.",
      codeFixed: true,
      details: {
        totalStuck,
        stuckVault: stuckPendingVault.rows,
        stuckArguments: stuckPendingArgs.rows,
        stuckBeliefs: stuckPendingBeliefs.rows,
        stuckTranslations: stuckPendingTranslations.rows,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    results.push({ name: "Vault/arguments/beliefs/translations consistency", status: "ERROR", description: `Errored: ${msg}`, details: { error: msg } });
  }

  // ═══════════════════════════════════════════════════════════════════
  // SECTION K: COMPLETE PROCESS INVENTORY
  // Every multi-step write in the system, whether it needs fixing
  // ═══════════════════════════════════════════════════════════════════

  results.push({
    name: "All multi-step write operations inventory",
    status: "INFO",
    description: "Every endpoint that does 2+ SQL writes without a real transaction. All use sql`` (stateless HTTP) so any multi-step sequence can leave partial state.",
    details: {
      critical: [
        { endpoint: "POST /submissions/[id]/vote", file: "src/app/api/submissions/[id]/vote/route.ts", risk: "CRITICAL",
          operations: "BEGIN(no-op) → FOR UPDATE(no-op) → INSERT vote → INSERT audit → COMMIT(no-op) → tryResolveSubmission(15+ writes)",
          consequence: "Vote auto-commits, user sees 500 if resolution fails. No row lock means race conditions." },
        { endpoint: "POST /lib/vote-resolution", file: "src/lib/vote-resolution.ts", risk: "CRITICAL",
          operations: "BEGIN(no-op) → UPDATE status → resolve edits → vault survival → graduate vault → reputation → cross-group → audit → COMMIT(no-op)",
          consequence: "Each step auto-commits. Failure at step N leaves steps 1..N-1 permanently committed." },
        { endpoint: "PATCH /di-requests/[id]", file: "src/app/api/di-requests/[id]/route.ts", risk: "CRITICAL",
          operations: "UPDATE di_request → UPDATE user1 → UPDATE user2",
          consequence: "Asymmetric DI partnership if second UPDATE fails." },
        { endpoint: "POST /submissions", file: "src/app/api/submissions/route.ts", risk: "CRITICAL",
          operations: "INSERT submission → INSERT evidence(loop) → INSERT edits(loop) → INSERT audit → UPDATE jury_seats → INSERT jury_assignments(loop)",
          consequence: "Orphaned submission if evidence/jury fails. Trusted-skip has broken BEGIN/COMMIT wrapping same auto-approve logic." },
      ],
      high: [
        { endpoint: "POST /auth/register", file: "src/app/api/auth/register/route.ts", risk: "HIGH",
          operations: "INSERT user → INSERT org_member → UPDATE primary_org_id",
          consequence: "User created without org membership if INSERT fails." },
        { endpoint: "POST /submissions/[id]/di-review", file: "src/app/api/submissions/[id]/di-review/route.ts", risk: "HIGH",
          operations: "UPDATE submission → INSERT jury_assignments(loop) → UPDATE status → INSERT audit",
          consequence: "Incomplete jury if loop fails mid-way." },
        { endpoint: "POST /orgs/[id]/join", file: "src/app/api/orgs/[id]/join/route.ts", risk: "HIGH",
          operations: "INSERT/UPDATE org_member → INSERT history",
          consequence: "Membership without history trail." },
        { endpoint: "PATCH /orgs/[id]/applications/[appId]", file: "src/app/api/orgs/[id]/applications/[appId]/route.ts", risk: "HIGH",
          operations: "UPDATE application → INSERT/UPDATE org_member → INSERT history",
          consequence: "Application approved but user not added to org." },
        { endpoint: "POST /orgs/[id]/leave", file: "src/app/api/orgs/[id]/leave/route.ts", risk: "HIGH",
          operations: "UPDATE org_member → INSERT history → UPDATE primary_org_id",
          consequence: "User deactivated but primary_org_id not cleared." },
      ],
      medium: [
        { endpoint: "POST /disputes", file: "src/app/api/disputes/route.ts", risk: "MEDIUM",
          operations: "INSERT dispute → INSERT evidence(loop) → INSERT audit",
          consequence: "Dispute without evidence or audit trail." },
        { endpoint: "POST /disputes/[id]/vote", file: "src/app/api/disputes/[id]/vote/route.ts", risk: "MEDIUM",
          operations: "INSERT vote → INSERT audit",
          consequence: "Vote without audit trail." },
        { endpoint: "POST /concessions/[id]/vote", file: "src/app/api/concessions/[id]/vote/route.ts", risk: "MEDIUM",
          operations: "INSERT vote → INSERT audit",
          consequence: "Vote without audit trail." },
      ],
      adminBulk: [
        { endpoint: "POST /admin/approve-pending", file: "src/app/api/admin/approve-pending/route.ts", risk: "CRITICAL",
          operations: "Loop: UPDATE submission → UPDATE user → UPDATE org_member → UPDATE vault tables → INSERT audit",
          consequence: "Partial bulk approve: some submissions approved, others not." },
        { endpoint: "POST /admin/force-di-partner", file: "src/app/api/admin/force-di-partner/route.ts", risk: "CRITICAL",
          operations: "Loop: UPDATE users → UPDATE submissions → INSERT/UPDATE di_requests → INSERT audit",
          consequence: "Partial DI linkage across multiple users." },
        { endpoint: "POST /admin/wild-west-backfill", file: "src/app/api/admin/wild-west-backfill/route.ts", risk: "CRITICAL",
          operations: "Loop: UPDATE submission → UPDATE user → UPDATE org_member → UPDATE vault → INSERT audit",
          consequence: "Same as approve-pending — partial state." },
        { endpoint: "POST /reconcile", file: "src/app/api/reconcile/route.ts", risk: "CRITICAL",
          operations: "Massive migration: 600+ lines, writes to 15+ tables in nested loops",
          consequence: "Partial migration leaves orphaned data across the entire system." },
      ],
    },
  });

  // ═══════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════
  const passCount = results.filter(r => r.status === "PASS").length;
  const failCount = results.filter(r => r.status === "FAIL").length;
  const warnCount = results.filter(r => r.status === "WARN").length;
  const errorCount = results.filter(r => r.status === "ERROR").length;
  const infoCount = results.filter(r => r.status === "INFO").length;

  const fixedCount = results.filter(r => r.codeFixed === true).length;
  const unfixedCount = results.filter(r => r.codeFixed === false).length;

  return ok({
    success: true,
    context: {
      purpose: "This diagnostic audits the entire Trust Assembly system for data inconsistencies caused by broken database transactions. The root cause: the sql`` tagged template from @vercel/postgres uses the neon() HTTP driver, where each call is a stateless HTTP request. BEGIN/COMMIT/ROLLBACK across separate sql`` calls are complete no-ops — they go to different connections.",
      fixApproach: "Replace sql`` with sql.connect() for any endpoint doing 2+ SQL writes. sql.connect() returns a dedicated pooled client where transactions work. Use client.query() with $1/$2 params instead of template literals.",
      codeFixStatus: `${fixedCount} section(s) have code fixes applied (vote endpoint + vote-resolution). ${unfixedCount} section(s) still need code fixes (registration, DI partnership, submission creation, disputes, membership applications, org join/leave, admin bulk ops).`,
      keyFiles: {
        dbDriver: "src/lib/db.ts — re-exports sql from @vercel/postgres",
        voteEndpoint: "src/app/api/submissions/[id]/vote/route.ts — FIXED: uses sql.connect()",
        voteResolution: "src/lib/vote-resolution.ts — FIXED: uses sql.connect(), all helpers accept VercelPoolClient",
        registration: "src/app/api/auth/register/route.ts — NOT YET FIXED",
        diPartnership: "src/app/api/di-requests/[id]/route.ts — NOT YET FIXED",
        submissionCreate: "src/app/api/submissions/route.ts — NOT YET FIXED",
        orgJoin: "src/app/api/orgs/[id]/join/route.ts — NOT YET FIXED",
        orgLeave: "src/app/api/orgs/[id]/leave/route.ts — NOT YET FIXED",
        appApproval: "src/app/api/orgs/[id]/applications/[appId]/route.ts — NOT YET FIXED",
        disputes: "src/app/api/disputes/route.ts — NOT YET FIXED",
        disputeVote: "src/app/api/disputes/[id]/vote/route.ts — NOT YET FIXED",
        concessionVote: "src/app/api/concessions/[id]/vote/route.ts — NOT YET FIXED",
        adminApprovePending: "src/app/api/admin/approve-pending/route.ts — NOT YET FIXED",
        adminForceDi: "src/app/api/admin/force-di-partner/route.ts — NOT YET FIXED",
        adminWildWest: "src/app/api/admin/wild-west-backfill/route.ts — NOT YET FIXED",
        reconcile: "src/app/api/reconcile/route.ts — NOT YET FIXED",
      },
      dataRepairNeeded: "Historical damage from broken transactions cannot be fixed by code changes alone. After deploying code fixes, run this diagnostic again. Any remaining FAILs on Sections B-J represent data that needs backfill scripts. Each section's 'remediation' field describes the specific repair needed.",
    },
    summary: {
      pass: passCount,
      fail: failCount,
      warn: warnCount,
      error: errorCount,
      info: infoCount,
      totalTests: results.length,
      codeFixed: fixedCount,
      codeUnfixed: unfixedCount,
      durationMs: Date.now() - startTime,
      verdict: failCount > 0
        ? "ISSUES FOUND — See per-submission audit and vote forensics for exact impact. Check each test's rootCause and remediation fields for next steps."
        : errorCount > 0
          ? "Some tests errored — review details. Fix query errors before drawing conclusions."
          : "All checks passed — no data inconsistencies detected.",
    },
    tests: results,
  });
}
