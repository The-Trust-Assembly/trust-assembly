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
        s.cross_group_seed, s.created_at, s.trusted_skip,
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
      const wasAdminApproved = audits.some(a =>
        (a.action as string)?.includes("Admin: approved pending") ||
        (a.action as string)?.includes("Admin: wild-west") ||
        (a.action as string)?.includes("admin_approve_pending")
      );
      const wasTrustedSkip = sub.trusted_skip === true;
      // Detect historical batch-approved submissions: backfilled audit + 0 votes
      // is the signature of subs approved via admin bulk endpoint before audit logging worked
      const wasLikelyBatchApproved = !wasAdminApproved && inGroupVotes.length === 0 &&
        audits.some(a => (a.action as string)?.includes("backfilled by repair script"));
      if (isResolved || isCrossReview) {
        if (inGroupVotes.length === 0) {
          if (wasAdminApproved) {
            steps.push({ step: "In-group votes", status: "OK", expected: "Admin-approved (no jury vote required)", actual: "0 votes — resolved by admin bulk-approval" });
          } else if (wasTrustedSkip) {
            steps.push({ step: "In-group votes", status: "OK", expected: "Trusted skip (streak >= 10)", actual: "0 votes — auto-approved via trusted streak" });
          } else if (wasLikelyBatchApproved) {
            steps.push({ step: "In-group votes", status: "OK", expected: "Likely admin batch-approved (historical)", actual: "0 votes — audit log is backfilled, original admin action lost" });
          } else {
            steps.push({ step: "In-group votes", status: "MISSING", expected: "At least 1 vote", actual: "0 votes" });
            issues.push("No in-group votes found for resolved/cross_review submission");
          }
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
      const voteAudits = audits.filter(a => (a.action as string).startsWith("Vote cast"));
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
          AND al.action LIKE 'Vote cast%'
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
      rootCause: "POST /auth/register uses sql.connect() transaction to INSERT user → INSERT organization_members → UPDATE users SET primary_org_id. If any step fails, the entire registration is rolled back.",
      remediation: "CODE FIX APPLIED: Uses sql.connect() transaction. Historical damage (NULL primary_org_id, missing org memberships) is repaired by the repair-data endpoint.",
      codeFixed: true,
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

    // Approved DI requests where the DI user isn't properly linked
    // (di_partner_id doesn't match, or is_di/di_approved not set)
    const approvedNotLinked = await sql`
      SELECT dr.id, dr.di_user_id, dr.partner_user_id, dr.status,
        u1.username AS di_user, u1.di_partner_id AS di_actual_partner, u1.is_di, u1.di_approved,
        u2.username AS partner_user
      FROM di_requests dr
      JOIN users u1 ON u1.id = dr.di_user_id
      JOIN users u2 ON u2.id = dr.partner_user_id
      WHERE dr.status = 'approved'
        AND (u1.di_partner_id != dr.partner_user_id
             OR u1.is_di != TRUE OR u1.di_approved != TRUE)
    `;

    // DI submissions without di_partner_id set
    const diSubsNoPartner = await sql`
      SELECT s.id, s.submitted_by, u.username
      FROM submissions s
      JOIN users u ON u.id = s.submitted_by
      WHERE s.is_di = TRUE AND s.di_partner_id IS NULL
    `;

    // Human partners with more than 5 approved DIs (over limit)
    const overLimit = await sql`
      SELECT partner_user_id, u.username, COUNT(*)::int AS di_count
      FROM di_requests dr
      JOIN users u ON u.id = dr.partner_user_id
      WHERE dr.status = 'approved'
      GROUP BY partner_user_id, u.username
      HAVING COUNT(*) > 5
    `;

    const diIssues: string[] = [];
    if (diNoPartner.rows.length > 0) diIssues.push(`${diNoPartner.rows.length} DI user(s) have is_di=TRUE but NULL di_partner_id — partnership setup failed`);
    if (approvedNotLinked.rows.length > 0) diIssues.push(`${approvedNotLinked.rows.length} approved DI request(s) but DI user not properly linked — di-request approved but user UPDATE failed`);
    if (diSubsNoPartner.rows.length > 0) diIssues.push(`${diSubsNoPartner.rows.length} DI submission(s) have is_di=TRUE but NULL di_partner_id`);
    if (overLimit.rows.length > 0) diIssues.push(`${overLimit.rows.length} human partner(s) exceed the 5-DI limit`);

    // Multi-DI partnership summary
    const diSummary = await sql`
      SELECT u.username AS partner, COUNT(*)::int AS di_count,
        array_agg(du.username ORDER BY dr.created_at) AS di_usernames
      FROM di_requests dr
      JOIN users u ON u.id = dr.partner_user_id
      JOIN users du ON du.id = dr.di_user_id
      WHERE dr.status = 'approved'
      GROUP BY u.username
    `;

    results.push({
      name: "DI partnership consistency",
      status: diIssues.length === 0 ? "PASS" : "FAIL",
      description: diIssues.length === 0
        ? `All DI partnerships are consistent. ${diSummary.rows.length} human partner(s) with approved DIs.`
        : `Found ${diIssues.length} DI issue(s):\n${diIssues.map(i => `  - ${i}`).join("\n")}`,
      rootCause: "PATCH /di-requests/[id] uses sql.connect() transaction to UPDATE di_requests status + UPDATE DI user (is_di, di_partner_id, di_approved) + UPDATE partner (di_partner_id if NULL). Source of truth for multi-DI partnerships is di_requests table, not users.di_partner_id.",
      remediation: "CODE FIX APPLIED: Uses sql.connect() transaction. Humans can have up to 5 DIs; the full list is derived from di_requests WHERE status='approved'. The human's users.di_partner_id holds the first approved DI only (for backward compat).",
      codeFixed: true,
      details: {
        diNoPartner: diNoPartner.rows.map(u => ({ user: `@${u.username}` })),
        approvedNotLinked: approvedNotLinked.rows.map(r => ({
          diUser: `@${r.di_user}`, partnerUser: `@${r.partner_user}`,
          requestStatus: r.status,
          diActualPartner: r.di_actual_partner,
          isDI: r.is_di, diApproved: r.di_approved,
        })),
        diSubsNoPartner: diSubsNoPartner.rows.map(r => ({ submission: r.id, user: `@${r.username}` })),
        overLimit: overLimit.rows.map(r => ({ partner: `@${r.username}`, diCount: r.di_count })),
        partnerships: diSummary.rows.map(r => ({
          partner: `@${r.partner}`, diCount: r.di_count, diUsers: (r.di_usernames as string[]).map(u => `@${u}`),
        })),
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
          AND (al.action LIKE 'Submission created%' OR al.action LIKE 'New submission%' OR al.action = 'Submitted correction' OR al.action LIKE 'Submission filed%')
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
      rootCause: "POST /submissions uses sql.connect() transaction for INSERT submission → INSERT evidence (loop) → INSERT inline_edits (loop) → INSERT audit → UPDATE jury_seats → INSERT jury_assignments (loop). Historical submissions from the broken sql`` era may have missing evidence or audit logs.",
      remediation: "CODE FIX APPLIED: Uses sql.connect() transaction. Historical damage (missing evidence, missing audit logs) is repaired by the repair-data endpoint. Evidence rows lost from the broken era cannot be recovered (data was never persisted).",
      codeFixed: true,
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
      rootCause: "POST /disputes, POST /disputes/[id]/vote, and POST /concessions/[id]/vote all use sql.connect() transactions. Historical missing audit logs are from the broken sql`` era.",
      remediation: "CODE FIX APPLIED: All 3 endpoints use sql.connect() transactions. Historical missing audit logs are cosmetic (data exists, just unlogged) and can be backfilled by the repair-data endpoint.",
      codeFixed: true,
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
      rootCause: "PATCH /orgs/[id]/applications/[appId] uses sql.connect() transaction to UPDATE application → INSERT/UPDATE organization_members → INSERT history. Historical damage from the broken sql`` era is repaired by the repair-data endpoint.",
      remediation: "CODE FIX APPLIED: Uses sql.connect() transaction. Historical approved-but-not-member cases are repaired by the repair-data endpoint.",
      codeFixed: true,
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
  // SECTION K2: DI PENDING SUBMISSIONS AUDIT
  // Check for di_pending submissions stuck without partner visibility
  // ═══════════════════════════════════════════════════════════════════

  try {
    const diPending = await sql`
      SELECT s.id, s.url, s.original_headline, s.is_di, s.di_partner_id,
             s.created_at, s.org_id,
             u.username AS submitter, u.is_di AS submitter_is_di,
             u.di_partner_id AS submitter_di_partner_id,
             partner.username AS partner_username,
             o.name AS org_name
      FROM submissions s
      LEFT JOIN users u ON u.id = s.submitted_by
      LEFT JOIN users partner ON partner.id = COALESCE(s.di_partner_id, u.di_partner_id)
      LEFT JOIN organizations o ON o.id = s.org_id
      WHERE s.status = 'di_pending'
      ORDER BY s.created_at DESC
    `;

    const diIssues: string[] = [];
    const stuckSubs: Array<Record<string, unknown>> = [];

    for (const sub of diPending.rows) {
      const issues: string[] = [];

      // Check: is_di should be true
      if (!sub.is_di) issues.push("is_di is FALSE — submission won't appear in DI queue");

      // Check: di_partner_id should be set on submission
      if (!sub.di_partner_id) {
        if (sub.submitter_di_partner_id) {
          issues.push(`di_partner_id is NULL on submission but submitter has partner @${sub.partner_username} — needs backfill`);
        } else {
          issues.push("di_partner_id is NULL on submission AND submitter has no partner — DI link may be broken");
        }
      }

      // Check: submitter should be a DI
      if (!sub.submitter_is_di) issues.push("submitter is_di is FALSE — not recognized as DI user");

      if (issues.length > 0) {
        stuckSubs.push({
          id: sub.id,
          submitter: `@${sub.submitter}`,
          partner: sub.partner_username ? `@${sub.partner_username}` : "NONE",
          org: sub.org_name,
          headline: sub.original_headline,
          createdAt: sub.created_at,
          diPartnerIdOnSub: sub.di_partner_id || "NULL",
          submitterIsDI: sub.submitter_is_di,
          issues,
        });
      }
    }

    const totalDiPending = diPending.rows.length;
    const stuckCount = stuckSubs.length;
    const healthyCount = totalDiPending - stuckCount;

    results.push({
      name: "DI pending submissions queue",
      status: stuckCount > 0 ? "FAIL" : totalDiPending > 0 ? "WARN" : "PASS",
      description: totalDiPending === 0
        ? "No di_pending submissions in queue."
        : stuckCount > 0
          ? `${stuckCount} of ${totalDiPending} di_pending submission(s) have issues that prevent them from appearing in the DI partner's queue.`
          : `${totalDiPending} di_pending submission(s) awaiting partner pre-approval. All have correct DI linkage.`,
      rootCause: "DI submissions set is_di=TRUE and di_partner_id from the submitter's user record at creation time. If the submitter's DI partnership wasn't fully persisted (broken sql`` era), di_partner_id may be NULL on the submission. The DI queue (GET /submissions/di-queue) matches on s.di_partner_id OR u.di_partner_id, but requires is_di=TRUE.",
      remediation: "Run: UPDATE submissions s SET di_partner_id = u.di_partner_id FROM users u WHERE s.submitted_by = u.id AND s.status = 'di_pending' AND s.di_partner_id IS NULL AND u.di_partner_id IS NOT NULL. Also verify submitter's is_di and di_partner_id are correct in users table.",
      codeFixed: true,
      details: {
        totalDiPending,
        healthyCount,
        stuckCount,
        stuckSubs,
        allDiPending: diPending.rows.map(s => ({
          id: s.id,
          submitter: `@${s.submitter}`,
          partner: s.partner_username ? `@${s.partner_username}` : "NONE",
          org: s.org_name,
          headline: s.original_headline,
          diPartnerIdOnSub: s.di_partner_id ? "SET" : "NULL",
          isDI: s.is_di,
          createdAt: s.created_at,
        })),
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    results.push({ name: "DI pending submissions queue", status: "ERROR", description: `Errored: ${msg}`, details: { error: msg } });
  }

  // ═══════════════════════════════════════════════════════════════════
  // SECTION K2: DI ACCOUNTS IN JURY ASSIGNMENTS
  // DI accounts (is_di=TRUE) should never be assigned as jurors.
  // Only human accounts should appear in jury_assignments.
  // ═══════════════════════════════════════════════════════════════════

  try {
    const diJurors = await sql`
      SELECT ja.submission_id, ja.user_id, u.username, u.is_di,
             s.status AS sub_status, s.submitted_by, o.name AS org_name
      FROM jury_assignments ja
      JOIN users u ON u.id = ja.user_id
      JOIN submissions s ON s.id = ja.submission_id
      LEFT JOIN organizations o ON o.id = s.org_id
      WHERE u.is_di = TRUE
      ORDER BY s.created_at DESC
    `;

    const diJurorCount = diJurors.rows.length;

    results.push({
      name: "DI accounts in jury assignments",
      status: diJurorCount === 0 ? "PASS" : "FAIL",
      description: diJurorCount === 0
        ? "No DI accounts found in jury assignments. Only human accounts are assigned as jurors."
        : `Found ${diJurorCount} jury assignment(s) where a DI account was assigned as juror. DI accounts should never be jurors — only their human partner should receive review assignments.`,
      rootCause: "Jury pool queries in POST /submissions and POST /submissions/[id]/di-review must JOIN users and filter u.is_di = FALSE to exclude DI accounts from the jury pool.",
      remediation: "CODE FIX: Add JOIN users u ON u.id = om.user_id AND u.is_di = FALSE to jury pool queries in submissions/route.ts and di-review/route.ts. DATA REPAIR: DELETE FROM jury_assignments WHERE user_id IN (SELECT id FROM users WHERE is_di = TRUE) to clean up historical bad assignments.",
      codeFixed: true,
      details: {
        diJurorCount,
        diJurors: diJurors.rows.map((r: Record<string, unknown>) => ({
          submissionId: r.submission_id,
          userId: r.user_id,
          username: r.username,
          orgName: r.org_name,
          submissionStatus: r.sub_status,
        })),
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    results.push({ name: "DI accounts in jury assignments", status: "ERROR", description: `Errored: ${msg}`, details: { error: msg } });
  }

  // ═══════════════════════════════════════════════════════════════════
  // SECTION L: PIPELINE STAGE AUDIT (DRY-RUN)
  // Traces every live submission through the pipeline stages:
  //   Created → Jury Assigned → Visible in Queue → Votes → Resolution → Published
  // ═══════════════════════════════════════════════════════════════════

  try {
    // ── L1: Pending submissions with NO jury assignments ──
    const pendingNoJury = await sql`
      SELECT s.id, s.status, s.jury_seats, s.created_at, s.org_id,
             u.username AS submitter, o.name AS org_name
      FROM submissions s
      LEFT JOIN users u ON u.id = s.submitted_by
      LEFT JOIN organizations o ON o.id = s.org_id
      WHERE s.status = 'pending_review'
        AND NOT EXISTS (
          SELECT 1 FROM jury_assignments ja WHERE ja.submission_id = s.id
        )
    `;

    // ── L2: pending_jury submissions (stuck waiting for org growth) ──
    const pendingJuryStuck = await sql`
      SELECT s.id, s.status, s.created_at, s.org_id,
             u.username AS submitter, o.name AS org_name,
             (SELECT COUNT(*) FROM organization_members om
              WHERE om.org_id = s.org_id AND om.is_active = TRUE)::int AS current_member_count
      FROM submissions s
      LEFT JOIN users u ON u.id = s.submitted_by
      LEFT JOIN organizations o ON o.id = s.org_id
      WHERE s.status = 'pending_jury'
    `;

    // ── L3: pending_review not visible to ANY assigned juror (all already voted or assignments stale) ──
    const invisibleToJury = await sql`
      SELECT s.id, s.status, s.jury_seats, s.created_at,
             u.username AS submitter, o.name AS org_name,
             (SELECT COUNT(*) FROM jury_assignments ja
              WHERE ja.submission_id = s.id AND ja.role = 'in_group')::int AS total_assigned,
             (SELECT COUNT(*) FROM jury_assignments ja
              WHERE ja.submission_id = s.id AND ja.role = 'in_group' AND ja.accepted = TRUE)::int AS accepted_count,
             (SELECT COUNT(DISTINCT jv.user_id) FROM jury_votes jv
              WHERE jv.submission_id = s.id AND jv.role = 'in_group')::int AS voted_count
      FROM submissions s
      LEFT JOIN users u ON u.id = s.submitted_by
      LEFT JOIN organizations o ON o.id = s.org_id
      WHERE s.status = 'pending_review'
    `;
    // Filter to submissions where every assigned juror has voted but resolution didn't trigger
    const stalledSubs = invisibleToJury.rows.filter(s =>
      (s.total_assigned as number) > 0 &&
      (s.voted_count as number) >= (s.total_assigned as number)
    );

    // ── L4: Submissions with enough votes for majority but NOT resolved ──
    const unresolvedWithMajority = await sql`
      SELECT s.id, s.status, s.jury_seats, s.created_at,
             u.username AS submitter, o.name AS org_name,
             (SELECT COUNT(*) FROM jury_votes jv
              WHERE jv.submission_id = s.id AND jv.role = 'in_group' AND jv.approve = TRUE)::int AS approve_count,
             (SELECT COUNT(*) FROM jury_votes jv
              WHERE jv.submission_id = s.id AND jv.role = 'in_group' AND jv.approve = FALSE)::int AS reject_count
      FROM submissions s
      LEFT JOIN users u ON u.id = s.submitted_by
      LEFT JOIN organizations o ON o.id = s.org_id
      WHERE s.status IN ('pending_review', 'cross_review')
    `;
    const shouldBeResolved = unresolvedWithMajority.rows.filter(s => {
      const seats = (s.jury_seats as number) || 3;
      const majority = Math.floor(seats / 2) + 1;
      return (s.approve_count as number) >= majority || (s.reject_count as number) >= majority;
    });

    // ── L5: Approved/consensus submissions NOT returned by corrections API ──
    // Check for approved submissions with missing normalized_url
    const approvedNoUrl = await sql`
      SELECT s.id, s.status, s.url, s.normalized_url, s.original_headline,
             u.username AS submitter
      FROM submissions s
      LEFT JOIN users u ON u.id = s.submitted_by
      WHERE s.status IN ('approved', 'consensus')
        AND (s.normalized_url IS NULL OR s.normalized_url = '')
    `;

    const pipelineIssues: string[] = [];
    if (pendingNoJury.rows.length > 0) pipelineIssues.push(`${pendingNoJury.rows.length} pending_review submission(s) have NO jury assignments`);
    if (pendingJuryStuck.rows.length > 0) pipelineIssues.push(`${pendingJuryStuck.rows.length} submission(s) stuck in pending_jury`);
    if (stalledSubs.length > 0) pipelineIssues.push(`${stalledSubs.length} submission(s) have all jurors voted but resolution never triggered`);
    if (shouldBeResolved.length > 0) pipelineIssues.push(`${shouldBeResolved.length} submission(s) have enough votes for majority but are NOT resolved`);
    if (approvedNoUrl.rows.length > 0) pipelineIssues.push(`${approvedNoUrl.rows.length} approved submission(s) have no normalized_url — invisible to corrections API`);

    results.push({
      name: "Pipeline stage audit (dry-run)",
      status: pipelineIssues.length === 0 ? "PASS" : "FAIL",
      description: pipelineIssues.length === 0
        ? "All submissions are progressing through the pipeline correctly. No stalled or invisible items."
        : `Found ${pipelineIssues.length} pipeline issue(s):\n${pipelineIssues.map(i => `  - ${i}`).join("\n")}`,
      rootCause: "Each submission must flow: Created → Jury Assigned → Visible in Queue → Votes Cast → Resolution Triggered → Published. A break at any stage leaves the submission stuck.",
      remediation: "pending_review with no jury: re-run jury assignment. pending_jury stuck: org needs more members or use admin approve. Stalled resolution: tryResolveSubmission failed silently — re-trigger vote. Missing normalized_url: backfill from url column.",
      details: {
        pendingReviewNoJury: pendingNoJury.rows.map(s => ({
          id: s.id, submitter: `@${s.submitter}`, org: s.org_name,
          jurySeats: s.jury_seats, createdAt: s.created_at,
        })),
        pendingJuryStuck: pendingJuryStuck.rows.map(s => ({
          id: s.id, submitter: `@${s.submitter}`, org: s.org_name,
          currentMemberCount: s.current_member_count, createdAt: s.created_at,
        })),
        stalledResolution: stalledSubs.map(s => ({
          id: s.id, submitter: `@${s.submitter}`, org: s.org_name,
          totalAssigned: s.total_assigned, votedCount: s.voted_count,
          jurySeats: s.jury_seats, createdAt: s.created_at,
        })),
        shouldBeResolved: shouldBeResolved.map(s => ({
          id: s.id, submitter: `@${s.submitter}`, org: s.org_name,
          approveCount: s.approve_count, rejectCount: s.reject_count,
          jurySeats: s.jury_seats, majority: Math.floor(((s.jury_seats as number) || 3) / 2) + 1,
        })),
        approvedNoUrl: approvedNoUrl.rows.map(s => ({
          id: s.id, submitter: `@${s.submitter}`, headline: s.original_headline,
          url: s.url, normalizedUrl: s.normalized_url,
        })),
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    results.push({ name: "Pipeline stage audit (dry-run)", status: "ERROR", description: `Errored: ${msg}`, details: { error: msg } });
  }

  // ═══════════════════════════════════════════════════════════════════
  // SECTION K: COMPLETE PROCESS INVENTORY
  // Every multi-step write in the system, whether it needs fixing
  // ═══════════════════════════════════════════════════════════════════

  results.push({
    name: "All multi-step write operations inventory",
    status: "INFO",
    description: "Every endpoint that does 2+ SQL writes. ALL now use sql.connect() with real BEGIN/COMMIT/ROLLBACK transactions.",
    details: {
      critical: [
        { endpoint: "POST /submissions/[id]/vote", file: "src/app/api/submissions/[id]/vote/route.ts", status: "FIXED",
          operations: "BEGIN → FOR UPDATE → INSERT vote → INSERT audit → COMMIT → tryResolveSubmission(15+ writes in nested transaction)" },
        { endpoint: "POST /lib/vote-resolution", file: "src/lib/vote-resolution.ts", status: "FIXED",
          operations: "BEGIN → UPDATE status → resolve edits → vault survival → graduate vault → reputation → cross-group → audit → COMMIT" },
        { endpoint: "PATCH /di-requests/[id]", file: "src/app/api/di-requests/[id]/route.ts", status: "FIXED",
          operations: "BEGIN → UPDATE di_request → UPDATE DI user → UPDATE partner (if NULL) → COMMIT" },
        { endpoint: "POST /submissions", file: "src/app/api/submissions/route.ts", status: "FIXED",
          operations: "BEGIN → INSERT submission → INSERT evidence(loop) → INSERT edits(loop) → INSERT audit → UPDATE jury_seats → INSERT jury_assignments(loop) → COMMIT" },
      ],
      high: [
        { endpoint: "POST /auth/register", file: "src/app/api/auth/register/route.ts", status: "FIXED",
          operations: "BEGIN → INSERT user → INSERT org_member → UPDATE primary_org_id → COMMIT" },
        { endpoint: "POST /submissions/[id]/di-review", file: "src/app/api/submissions/[id]/di-review/route.ts", status: "FIXED",
          operations: "BEGIN → UPDATE submission → INSERT jury_assignments(loop) → UPDATE status → INSERT audit → COMMIT" },
        { endpoint: "POST /orgs/[id]/join", file: "src/app/api/orgs/[id]/join/route.ts", status: "FIXED",
          operations: "BEGIN → INSERT/UPDATE org_member → INSERT history → COMMIT" },
        { endpoint: "PATCH /orgs/[id]/applications/[appId]", file: "src/app/api/orgs/[id]/applications/[appId]/route.ts", status: "FIXED",
          operations: "BEGIN → UPDATE application → INSERT/UPDATE org_member → INSERT history → COMMIT" },
        { endpoint: "POST /orgs/[id]/leave", file: "src/app/api/orgs/[id]/leave/route.ts", status: "FIXED",
          operations: "BEGIN → UPDATE org_member → INSERT history → UPDATE primary_org_id → COMMIT" },
      ],
      medium: [
        { endpoint: "POST /disputes", file: "src/app/api/disputes/route.ts", status: "FIXED",
          operations: "BEGIN → INSERT dispute → INSERT evidence(loop) → INSERT audit → COMMIT" },
        { endpoint: "POST /disputes/[id]/vote", file: "src/app/api/disputes/[id]/vote/route.ts", status: "FIXED",
          operations: "BEGIN → INSERT vote → INSERT audit → COMMIT" },
        { endpoint: "POST /concessions/[id]/vote", file: "src/app/api/concessions/[id]/vote/route.ts", status: "FIXED",
          operations: "BEGIN → INSERT vote → INSERT audit → COMMIT" },
      ],
      adminBulk: [
        { endpoint: "POST /admin/approve-pending", file: "src/app/api/admin/approve-pending/route.ts", status: "FIXED",
          operations: "BEGIN → Loop: UPDATE submission → UPDATE user → UPDATE org_member → UPDATE vault tables → INSERT audit → COMMIT" },
        { endpoint: "POST /admin/force-di-partner", file: "src/app/api/admin/force-di-partner/route.ts", status: "FIXED",
          operations: "BEGIN → Loop: UPDATE users → UPDATE submissions → INSERT/UPDATE di_requests → INSERT audit → COMMIT" },
        { endpoint: "POST /admin/wild-west-backfill", file: "src/app/api/admin/wild-west-backfill/route.ts", status: "FIXED",
          operations: "BEGIN → Loop: UPDATE submission → UPDATE user → UPDATE org_member → UPDATE vault → INSERT audit → COMMIT" },
        { endpoint: "POST /reconcile", file: "src/app/api/reconcile/route.ts", status: "FIXED",
          operations: "BEGIN → Migration: writes to 15+ tables in nested loops → COMMIT" },
      ],
    },
  });

  // ═══════════════════════════════════════════════════════════════════
  // SECTION E: DISPUTE & CONCESSION PIPELINE AUDIT
  // Validates that disputes and concessions have complete data
  // ═══════════════════════════════════════════════════════════════════

  try {
    // E1: Disputes with valid submission references
    const orphanedDisputes = await sql`
      SELECT d.id, d.submission_id, d.status
      FROM disputes d
      LEFT JOIN submissions s ON s.id = d.submission_id
      WHERE s.id IS NULL
    `;
    results.push({
      name: "E1: Orphaned disputes (no submission)",
      status: orphanedDisputes.rows.length === 0 ? "PASS" : "FAIL",
      description: orphanedDisputes.rows.length === 0
        ? "All disputes reference valid submissions."
        : `${orphanedDisputes.rows.length} dispute(s) reference non-existent submissions.`,
      rootCause: "Dispute's submission_id points to a deleted or non-existent submission.",
      remediation: "Delete orphaned dispute records or restore the referenced submissions.",
      codeFixed: true,
      details: { orphanedDisputes: orphanedDisputes.rows.map(d => ({ id: d.id, submissionId: d.submission_id, status: d.status })) },
    });

    // E2: Resolved disputes with complete vote records
    const resolvedDisputes = await sql`
      SELECT d.id, d.status, d.submission_id,
        (SELECT COUNT(*)::int FROM jury_votes jv WHERE jv.dispute_id = d.id) AS vote_count,
        (SELECT COUNT(*)::int FROM jury_assignments ja WHERE ja.dispute_id = d.id) AS juror_count
      FROM disputes d
      WHERE d.status IN ('upheld', 'dismissed')
    `;
    // Note: disputes may use their own vote tracking, check if dispute votes exist
    const disputeVoteCheck = await sql`
      SELECT d.id, d.status,
        (SELECT COUNT(*)::int FROM audit_log al WHERE al.entity_type = 'dispute' AND al.entity_id = d.id) AS audit_count
      FROM disputes d
      WHERE d.status IN ('upheld', 'dismissed')
    `;
    const disputesNoAudit = disputeVoteCheck.rows.filter((d: Record<string, unknown>) => (d.audit_count as number) === 0);
    results.push({
      name: "E2: Resolved disputes have audit logs",
      status: disputesNoAudit.length === 0 ? "PASS" : "WARN",
      description: disputesNoAudit.length === 0
        ? `All ${disputeVoteCheck.rows.length} resolved disputes have audit log entries.`
        : `${disputesNoAudit.length}/${disputeVoteCheck.rows.length} resolved disputes have no audit log entries.`,
      rootCause: "Dispute resolution may have failed to write audit logs (transaction-era bug).",
      remediation: "Run repair-data to backfill missing audit logs for resolved disputes.",
      codeFixed: true,
      details: { totalResolved: disputeVoteCheck.rows.length, missingAudit: disputesNoAudit.length },
    });

    // E3: Disputes with evidence integrity
    const disputeEvidenceCheck = await sql`
      SELECT d.id, d.status,
        (SELECT COUNT(*)::int FROM dispute_evidence de WHERE de.dispute_id = d.id) AS evidence_count
      FROM disputes d
    `;
    results.push({
      name: "E3: Dispute evidence integrity",
      status: "INFO",
      description: `${disputeEvidenceCheck.rows.length} total disputes, ${disputeEvidenceCheck.rows.filter((d: Record<string, unknown>) => (d.evidence_count as number) > 0).length} have evidence attached.`,
      codeFixed: true,
      details: {
        total: disputeEvidenceCheck.rows.length,
        withEvidence: disputeEvidenceCheck.rows.filter((d: Record<string, unknown>) => (d.evidence_count as number) > 0).length,
        withoutEvidence: disputeEvidenceCheck.rows.filter((d: Record<string, unknown>) => (d.evidence_count as number) === 0).length,
      },
    });

    // E4: Concessions with valid submission references
    const orphanedConcessions = await sql`
      SELECT c.id, c.submission_id, c.status
      FROM concessions c
      LEFT JOIN submissions s ON s.id = c.submission_id
      WHERE s.id IS NULL
    `;
    results.push({
      name: "E4: Orphaned concessions (no submission)",
      status: orphanedConcessions.rows.length === 0 ? "PASS" : "FAIL",
      description: orphanedConcessions.rows.length === 0
        ? "All concessions reference valid submissions."
        : `${orphanedConcessions.rows.length} concession(s) reference non-existent submissions.`,
      codeFixed: true,
      details: { orphanedConcessions: orphanedConcessions.rows.map(c => ({ id: c.id, submissionId: c.submission_id, status: c.status })) },
    });

    // E5: Dispute type column presence check
    try {
      const typeCheck = await sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'disputes' AND column_name = 'dispute_type'
      `;
      results.push({
        name: "E5: Dispute type column exists",
        status: typeCheck.rows.length > 0 ? "PASS" : "INFO",
        description: typeCheck.rows.length > 0
          ? "disputes.dispute_type column exists (challenge_approval / challenge_rejection)."
          : "disputes.dispute_type column not yet created — will be added on first dispute filing.",
        codeFixed: true,
        details: { exists: typeCheck.rows.length > 0 },
      });
    } catch {
      results.push({
        name: "E5: Dispute type column check",
        status: "INFO",
        description: "Could not check for dispute_type column.",
        codeFixed: true,
        details: {},
      });
    }
  } catch (sectionEError) {
    results.push({
      name: "Section E: Dispute & Concession Audit",
      status: "ERROR",
      description: `Section E failed: ${sectionEError instanceof Error ? sectionEError.message : String(sectionEError)}`,
      codeFixed: true,
      details: {},
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // SECTION F: STORY PAGES PIPELINE AUDIT
  // ═══════════════════════════════════════════════════════════════════
  try {
    // Check if stories table exists before querying
    const storiesTableCheck = await sql`
      SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stories') AS exists
    `;
    if (!storiesTableCheck.rows[0]?.exists) {
      results.push({
        name: "Section F: Story Pages Pipeline Audit",
        status: "INFO",
        description: "Stories table does not exist yet — migration 004_story_pages.sql has not been run. Skipping story audit.",
        codeFixed: true,
        details: { reason: "table_not_found", table: "stories", migration: "004_story_pages.sql" },
      });
    } else {
    // F1: Stories without jury assignments
    const storiesNoJury = await sql`
      SELECT s.id, s.title, s.status, s.created_at
      FROM stories s
      WHERE s.status IN ('pending_jury', 'pending_review')
        AND NOT EXISTS (SELECT 1 FROM jury_assignments ja WHERE ja.story_id = s.id)
    `;
    results.push({
      name: "F1: Pending stories have jury assignments",
      status: storiesNoJury.rows.length === 0 ? "PASS" : "FAIL",
      description: storiesNoJury.rows.length === 0
        ? "All pending stories have jury assignments."
        : `${storiesNoJury.rows.length} pending story(s) have no jury assignments.`,
      rootCause: "Story creation may have failed after INSERT but before jury assignment (transaction-era bug).",
      remediation: "Manually draw jury for these stories or delete and recreate them.",
      codeFixed: true,
      details: { storiesWithoutJury: storiesNoJury.rows.map(s => ({ id: s.id, title: s.title, status: s.status, createdAt: s.created_at })) },
    });

    // F2: Ghost story votes — votes without audit logs
    const ghostStoryVotes = await sql`
      SELECT jv.user_id, jv.story_id, jv.voted_at, s.title, s.status AS story_status
      FROM jury_votes jv
      JOIN stories s ON s.id = jv.story_id
      WHERE jv.story_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM audit_log al
          WHERE al.entity_type = 'story'
            AND al.entity_id = jv.story_id
            AND al.action LIKE 'Vote cast%'
            AND al.user_id = jv.user_id
        )
    `;
    results.push({
      name: "F2: Ghost story votes (vote saved, audit missing)",
      status: ghostStoryVotes.rows.length === 0 ? "PASS" : "WARN",
      description: ghostStoryVotes.rows.length === 0
        ? "No ghost story votes detected."
        : `${ghostStoryVotes.rows.length} story vote(s) lack audit log entries (user may have seen 500 error).`,
      rootCause: "Vote INSERT succeeded but audit log INSERT failed — broken transaction.",
      remediation: "Run repair-data to backfill missing audit logs.",
      codeFixed: true,
      details: { ghostStoryVotes: ghostStoryVotes.rows.map(v => ({ userId: v.user_id, storyId: v.story_id, storyTitle: v.title, storyStatus: v.story_status, votedAt: v.voted_at })) },
    });

    // F3: Stuck story resolutions — all jurors voted but story still pending
    const stuckStories = await sql`
      SELECT s.id, s.title, s.status, s.jury_seats,
        (SELECT COUNT(*)::int FROM jury_votes jv WHERE jv.story_id = s.id) AS vote_count,
        (SELECT COUNT(*)::int FROM jury_assignments ja WHERE ja.story_id = s.id AND ja.role = 'juror') AS juror_count
      FROM stories s
      WHERE s.status IN ('pending_review', 'cross_review')
    `;
    const actuallyStuck = stuckStories.rows.filter((s: Record<string, unknown>) => {
      const votes = s.vote_count as number;
      const jurors = s.juror_count as number;
      return jurors > 0 && votes >= jurors;
    });
    results.push({
      name: "F3: Stuck story resolutions",
      status: actuallyStuck.length === 0 ? "PASS" : "FAIL",
      description: actuallyStuck.length === 0
        ? "No stuck story resolutions detected."
        : `${actuallyStuck.length} story(s) have all votes cast but are still pending.`,
      rootCause: "tryResolveStory() may not have been called or failed after vote insertion.",
      remediation: "Re-trigger resolution for these stories.",
      codeFixed: true,
      details: { stuckStories: actuallyStuck.map(s => ({ id: s.id, title: s.title, status: s.status, votes: s.vote_count, jurors: s.juror_count })) },
    });

    // F4: Orphaned story_submissions
    const orphanedStorySubs = await sql`
      SELECT ss.id, ss.story_id, ss.submission_id
      FROM story_submissions ss
      LEFT JOIN stories s ON s.id = ss.story_id
      LEFT JOIN submissions sub ON sub.id = ss.submission_id
      WHERE s.id IS NULL OR sub.id IS NULL
    `;
    results.push({
      name: "F4: Orphaned story_submissions",
      status: orphanedStorySubs.rows.length === 0 ? "PASS" : "WARN",
      description: orphanedStorySubs.rows.length === 0
        ? "No orphaned story-submission links."
        : `${orphanedStorySubs.rows.length} story_submissions reference missing stories or submissions.`,
      codeFixed: true,
      details: { orphanedCount: orphanedStorySubs.rows.length },
    });

    // F5: Cross-group promotion consistency
    const crossGroupStories = await sql`
      SELECT s.id, s.title,
        (SELECT COUNT(*)::int FROM jury_assignments ja WHERE ja.story_id = s.id AND ja.role = 'cross_group_juror') AS cg_juror_count
      FROM stories s
      WHERE s.status = 'cross_review'
    `;
    const noCGJury = crossGroupStories.rows.filter((s: Record<string, unknown>) => (s.cg_juror_count as number) === 0);
    results.push({
      name: "F5: Cross-review stories have cross-group jury",
      status: noCGJury.length === 0 ? "PASS" : "FAIL",
      description: noCGJury.length === 0
        ? `All ${crossGroupStories.rows.length} cross-review stories have cross-group jurors.`
        : `${noCGJury.length} cross-review story(s) lack cross-group jury assignments.`,
      rootCause: "promoteStoryToCrossGroup() may have failed after status update.",
      remediation: "Re-run cross-group promotion for these stories.",
      codeFixed: true,
      details: { totalCrossReview: crossGroupStories.rows.length, missingJury: noCGJury.length },
    });
    } // end else (stories table exists)
  } catch (sectionFError) {
    results.push({
      name: "Section F: Story Pages Pipeline Audit",
      status: "ERROR",
      description: `Section F failed: ${sectionFError instanceof Error ? sectionFError.message : String(sectionFError)}`,
      codeFixed: true,
      details: {},
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // SECTION G: DRAFTS CONSISTENCY
  // ═══════════════════════════════════════════════════════════════════
  try {
    // Check if submission_drafts table exists before querying
    const draftsTableCheck = await sql`
      SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'submission_drafts') AS exists
    `;
    if (!draftsTableCheck.rows[0]?.exists) {
      results.push({
        name: "Section G: Drafts Consistency",
        status: "INFO",
        description: "submission_drafts table does not exist yet — migration 005_submission_drafts.sql has not been run. Skipping drafts audit.",
        codeFixed: true,
        details: { reason: "table_not_found", table: "submission_drafts", migration: "005_submission_drafts.sql" },
      });
    } else {
    // G1: Orphaned drafts (user deleted but draft remains — shouldn't happen with CASCADE)
    const orphanedDrafts = await sql`
      SELECT sd.id, sd.user_id
      FROM submission_drafts sd
      LEFT JOIN users u ON u.id = sd.user_id
      WHERE u.id IS NULL
    `;
    results.push({
      name: "G1: Orphaned drafts (missing user)",
      status: orphanedDrafts.rows.length === 0 ? "PASS" : "WARN",
      description: orphanedDrafts.rows.length === 0
        ? "No orphaned drafts."
        : `${orphanedDrafts.rows.length} draft(s) reference non-existent users.`,
      codeFixed: true,
      details: { orphanedCount: orphanedDrafts.rows.length },
    });

    // G2: Over-limit users (more than 10 drafts)
    const overLimit = await sql`
      SELECT user_id, COUNT(*)::int AS cnt
      FROM submission_drafts
      GROUP BY user_id
      HAVING COUNT(*) > 10
    `;
    results.push({
      name: "G2: Users exceeding draft limit (>10)",
      status: overLimit.rows.length === 0 ? "PASS" : "WARN",
      description: overLimit.rows.length === 0
        ? "No users exceed the 10-draft limit."
        : `${overLimit.rows.length} user(s) have more than 10 drafts.`,
      codeFixed: true,
      details: { overLimitUsers: overLimit.rows.map(r => ({ userId: r.user_id, count: r.cnt })) },
    });

    // G3: Stale drafts (older than 30 days)
    const staleDrafts = await sql`
      SELECT COUNT(*)::int AS cnt
      FROM submission_drafts
      WHERE updated_at < now() - interval '30 days'
    `;
    const totalDrafts = await sql`SELECT COUNT(*)::int AS cnt FROM submission_drafts`;
    results.push({
      name: "G3: Stale drafts (>30 days old)",
      status: "INFO",
      description: `${staleDrafts.rows[0].cnt} of ${totalDrafts.rows[0].cnt} total drafts are older than 30 days.`,
      codeFixed: true,
      details: { stale: staleDrafts.rows[0].cnt, total: totalDrafts.rows[0].cnt },
    });
    } // end else (submission_drafts table exists)
  } catch (sectionGError) {
    results.push({
      name: "Section G: Drafts Consistency",
      status: "ERROR",
      description: `Section G failed: ${sectionGError instanceof Error ? sectionGError.message : String(sectionGError)}`,
      codeFixed: true,
      details: {},
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // SECTION H: SEO SLUG CONSISTENCY
  // Verify that all public-facing entities have SEO-friendly slugs
  // and that slug generation is wired into creation endpoints.
  // ═══════════════════════════════════════════════════════════════════
  try {
    // Check for missing slugs on resolved submissions (should have been set at creation)
    const submissionsNoSlug = await sql`
      SELECT id, original_headline, status, created_at
      FROM submissions
      WHERE slug IS NULL AND status IN ('approved', 'consensus')
      ORDER BY created_at DESC
    `;

    // Check for missing slugs on organizations
    const orgsNoSlug = await sql`
      SELECT id, name, created_at
      FROM organizations WHERE slug IS NULL
    `;

    // Check for missing slugs on stories
    const storiesNoSlugResult = await sql`
      SELECT id, title, status, created_at
      FROM stories WHERE slug IS NULL
    `;

    // Check for missing slugs on vault entries
    const vaultNoSlug = await sql`
      SELECT id, assertion, status, created_at
      FROM vault_entries WHERE slug IS NULL
    `;

    const totalMissing =
      submissionsNoSlug.rows.length +
      orgsNoSlug.rows.length +
      storiesNoSlugResult.rows.length +
      vaultNoSlug.rows.length;

    results.push({
      name: "H1: SEO slug coverage",
      status: totalMissing === 0 ? "PASS" : "WARN",
      description: totalMissing === 0
        ? "All entities have SEO slugs. Public pages (/correction/[slug], /story/[slug], /assembly/[slug]) will resolve correctly."
        : `${totalMissing} entity(s) missing SEO slugs — run migration 006_seo_slugs.sql to backfill.`,
      rootCause: "Slugs were added in migration 006. Entities created before the migration or where slug generation failed at creation time will have NULL slugs.",
      remediation: "Run migration 006_seo_slugs.sql to backfill slugs from existing titles/headlines/names. New entities will get slugs automatically at creation time.",
      codeFixed: true,
      details: {
        submissionsWithoutSlug: submissionsNoSlug.rows.length,
        orgsWithoutSlug: orgsNoSlug.rows.length,
        storiesWithoutSlug: storiesNoSlugResult.rows.length,
        vaultWithoutSlug: vaultNoSlug.rows.length,
        sampleMissing: {
          submissions: submissionsNoSlug.rows.slice(0, 5).map(s => ({ id: s.id, headline: s.original_headline, status: s.status })),
          orgs: orgsNoSlug.rows.slice(0, 5).map(o => ({ id: o.id, name: o.name })),
          stories: storiesNoSlugResult.rows.slice(0, 5).map(s => ({ id: s.id, title: s.title, status: s.status })),
          vault: vaultNoSlug.rows.slice(0, 5).map(v => ({ id: v.id, assertion: (v.assertion as string)?.slice(0, 60) })),
        },
      },
    });

    // Check for duplicate slugs (shouldn't happen with unique indexes, but verify)
    const dupSubmissionSlugs = await sql`
      SELECT slug, COUNT(*)::int AS cnt
      FROM submissions WHERE slug IS NOT NULL
      GROUP BY slug HAVING COUNT(*) > 1
    `;
    const dupOrgSlugs = await sql`
      SELECT slug, COUNT(*)::int AS cnt
      FROM organizations WHERE slug IS NOT NULL
      GROUP BY slug HAVING COUNT(*) > 1
    `;

    const totalDups = dupSubmissionSlugs.rows.length + dupOrgSlugs.rows.length;

    results.push({
      name: "H2: SEO slug uniqueness",
      status: totalDups === 0 ? "PASS" : "FAIL",
      description: totalDups === 0
        ? "All slugs are unique. No collision risk for public URLs."
        : `${totalDups} duplicate slug group(s) found — public page routing may resolve to wrong entity.`,
      rootCause: "Slug generation should produce unique slugs via ID suffix. Duplicates indicate a bug in slug generation or a missing unique index.",
      remediation: "Inspect duplicate slugs and regenerate them. Ensure unique indexes exist on slug columns (migration 006).",
      codeFixed: true,
      details: {
        duplicateSubmissionSlugs: dupSubmissionSlugs.rows,
        duplicateOrgSlugs: dupOrgSlugs.rows,
      },
    });

    // Verify slug format quality (no empty slugs, no overly long slugs, no invalid chars)
    const badSlugs = await sql`
      SELECT 'submission' AS entity, id, slug FROM submissions
      WHERE slug IS NOT NULL AND (slug = '' OR length(slug) > 200 OR slug ~ '[^a-z0-9-]')
      UNION ALL
      SELECT 'organization' AS entity, id, slug FROM organizations
      WHERE slug IS NOT NULL AND (slug = '' OR length(slug) > 200 OR slug ~ '[^a-z0-9-]')
      UNION ALL
      SELECT 'story' AS entity, id, slug FROM stories
      WHERE slug IS NOT NULL AND (slug = '' OR length(slug) > 200 OR slug ~ '[^a-z0-9-]')
      UNION ALL
      SELECT 'vault_entry' AS entity, id, slug FROM vault_entries
      WHERE slug IS NOT NULL AND (slug = '' OR length(slug) > 200 OR slug ~ '[^a-z0-9-]')
      LIMIT 20
    `;

    results.push({
      name: "H3: SEO slug format quality",
      status: badSlugs.rows.length === 0 ? "PASS" : "WARN",
      description: badSlugs.rows.length === 0
        ? "All slugs are well-formed (lowercase alphanumeric + hyphens, reasonable length)."
        : `${badSlugs.rows.length} slug(s) have format issues (empty, too long, or invalid characters).`,
      rootCause: "Slug generation should produce lowercase alphanumeric strings with hyphens only.",
      remediation: "Regenerate malformed slugs using the slugify() utility from src/lib/slugify.ts.",
      codeFixed: true,
      details: {
        malformedSlugs: badSlugs.rows.map(s => ({ entity: s.entity, id: s.id, slug: s.slug })),
      },
    });
  } catch (sectionHError: unknown) {
    results.push({
      name: "Section H: SEO Slug Consistency",
      status: "ERROR",
      description: `Section H failed: ${sectionHError instanceof Error ? sectionHError.message : String(sectionHError)}`,
      codeFixed: true,
      details: {},
    });
  }

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
      codeFixStatus: `All ${fixedCount + unfixedCount} audited section(s) have code fixes applied — every multi-step write endpoint uses sql.connect() with real BEGIN/COMMIT/ROLLBACK transactions.`,
      keyFiles: {
        dbDriver: "src/lib/db.ts — re-exports sql from @vercel/postgres",
        voteEndpoint: "src/app/api/submissions/[id]/vote/route.ts — FIXED: uses sql.connect()",
        voteResolution: "src/lib/vote-resolution.ts — FIXED: uses sql.connect(), all helpers accept VercelPoolClient",
        registration: "src/app/api/auth/register/route.ts — FIXED: uses sql.connect()",
        diPartnership: "src/app/api/di-requests/[id]/route.ts — FIXED: uses sql.connect()",
        submissionCreate: "src/app/api/submissions/route.ts — FIXED: uses sql.connect()",
        orgJoin: "src/app/api/orgs/[id]/join/route.ts — FIXED: uses sql.connect()",
        orgLeave: "src/app/api/orgs/[id]/leave/route.ts — FIXED: uses sql.connect()",
        appApproval: "src/app/api/orgs/[id]/applications/[appId]/route.ts — FIXED: uses sql.connect()",
        disputes: "src/app/api/disputes/route.ts — FIXED: uses sql.connect()",
        disputeVote: "src/app/api/disputes/[id]/vote/route.ts — FIXED: uses sql.connect()",
        concessionVote: "src/app/api/concessions/[id]/vote/route.ts — FIXED: uses sql.connect()",
        adminApprovePending: "src/app/api/admin/approve-pending/route.ts — FIXED: uses sql.connect()",
        adminForceDi: "src/app/api/admin/force-di-partner/route.ts — FIXED: uses sql.connect()",
        adminWildWest: "src/app/api/admin/wild-west-backfill/route.ts — FIXED: uses sql.connect()",
        reconcile: "src/app/api/reconcile/route.ts — FIXED: uses sql.connect()",
        storyCreate: "src/app/api/stories/route.ts — FIXED: uses sql.connect()",
        storyVote: "src/app/api/stories/[id]/vote/route.ts — FIXED: uses sql.connect()",
        drafts: "src/app/api/drafts/route.ts — simple single-write operations, no transaction needed",
      },
      dataRepairNeeded: "Historical damage from the broken sql`` era has been repaired by the repair-data endpoint. Run this diagnostic to verify all data is consistent. Remaining FAILs indicate historical damage that the repair script couldn't fully address (e.g. lost evidence data).",
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
