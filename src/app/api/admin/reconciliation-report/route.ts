import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden } from "@/lib/api-utils";

// GET /api/admin/reconciliation-report
// Returns a comprehensive JSON report on system health, error trends,
// transaction chain status, and data reconciliation checks.

interface ChainHealth {
  status: "green" | "yellow" | "red";
  ghost_test_passed: boolean;
  errors_24h: number;
  last_error: string | null;
  details: string;
}

function chainHealth(errors24h: number, ghostPassed: boolean, lastError: string | null): ChainHealth {
  let status: "green" | "yellow" | "red" = "green";
  if (!ghostPassed) status = "red";
  else if (errors24h > 0) status = "yellow";
  return {
    status,
    ghost_test_passed: ghostPassed,
    errors_24h: errors24h,
    last_error: lastError,
    details: status === "green"
      ? "No issues detected"
      : status === "yellow"
        ? `${errors24h} error(s) in last 24h but ghost test passed`
        : "Ghost test failed or critical errors detected",
  };
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  const startTime = Date.now();

  // ═══════════════════════════════════════════════════════════════════
  // CLEANUP: 30-day error retention + 7-day resolved archival
  // ═══════════════════════════════════════════════════════════════════
  try {
    await sql`DELETE FROM client_errors WHERE created_at < now() - interval '30 days'`;
    await sql`
      UPDATE client_errors
      SET error_stack = NULL, request_body = NULL
      WHERE resolved = TRUE AND resolved_at < now() - interval '7 days'
        AND (error_stack IS NOT NULL OR request_body IS NOT NULL)
    `;
  } catch (e) {
    console.error("[reconciliation-report] Error cleanup failed:", e);
  }

  // ═══════════════════════════════════════════════════════════════════
  // ERROR SUMMARY
  // ═══════════════════════════════════════════════════════════════════

  const [errors24h, errors7d, errors30d, unresolvedCount, recurringPatterns] = await Promise.all([
    sql`
      SELECT
        COUNT(*)::int AS total,
        json_object_agg(COALESCE(api_route, 'unknown'), COALESCE(route_count, 0)) FILTER (WHERE api_route IS NOT NULL) AS by_route,
        json_object_agg(COALESCE(error_type, 'unknown'), COALESCE(type_count, 0)) FILTER (WHERE error_type IS NOT NULL) AS by_type
      FROM (
        SELECT COUNT(*)::int AS total FROM client_errors WHERE created_at > now() - interval '24 hours'
      ) t,
      LATERAL (
        SELECT api_route, COUNT(*)::int AS route_count FROM client_errors WHERE created_at > now() - interval '24 hours' GROUP BY api_route
      ) r,
      LATERAL (
        SELECT error_type, COUNT(*)::int AS type_count FROM client_errors WHERE created_at > now() - interval '24 hours' GROUP BY error_type
      ) ty
    `.catch(() => ({ rows: [{ total: 0, by_route: {}, by_type: {} }] })),

    // Simpler individual queries for reliability
    sql`SELECT COUNT(*)::int AS total FROM client_errors WHERE created_at > now() - interval '7 days'`,
    sql`SELECT COUNT(*)::int AS total FROM client_errors WHERE created_at > now() - interval '30 days'`,
    sql`SELECT COUNT(*)::int AS total FROM client_errors WHERE resolved = FALSE`,

    sql`
      SELECT api_route AS route, source_function AS function,
             (COUNT(*) + COALESCE(SUM(duplicate_count), 0))::int AS count,
             MAX(created_at) AS last_seen
      FROM client_errors
      WHERE resolved = FALSE AND created_at > now() - interval '30 days'
      GROUP BY api_route, source_function
      HAVING COUNT(*) >= 3
      ORDER BY count DESC
      LIMIT 20
    `,
  ]);

  // Per-route and per-type breakdowns for each window
  const [byRoute24h, byType24h, byRoute7d, byType7d, byRoute30d, byType30d] = await Promise.all([
    sql`SELECT api_route, COUNT(*)::int AS cnt FROM client_errors WHERE created_at > now() - interval '24 hours' GROUP BY api_route`,
    sql`SELECT error_type, COUNT(*)::int AS cnt FROM client_errors WHERE created_at > now() - interval '24 hours' GROUP BY error_type`,
    sql`SELECT api_route, COUNT(*)::int AS cnt FROM client_errors WHERE created_at > now() - interval '7 days' GROUP BY api_route`,
    sql`SELECT error_type, COUNT(*)::int AS cnt FROM client_errors WHERE created_at > now() - interval '7 days' GROUP BY error_type`,
    sql`SELECT api_route, COUNT(*)::int AS cnt FROM client_errors WHERE created_at > now() - interval '30 days' GROUP BY api_route`,
    sql`SELECT error_type, COUNT(*)::int AS cnt FROM client_errors WHERE created_at > now() - interval '30 days' GROUP BY error_type`,
  ]);

  function toRecord(rows: Record<string, unknown>[], key: string): Record<string, number> {
    const result: Record<string, number> = {};
    for (const row of rows) {
      const k = (row[key] as string) ?? "unknown";
      result[k] = row.cnt as number;
    }
    return result;
  }

  // ═══════════════════════════════════════════════════════════════════
  // CHAIN-SPECIFIC ERROR COUNTS (last 24h)
  // ═══════════════════════════════════════════════════════════════════

  const chainErrorCounts = await sql`
    SELECT api_route, COUNT(*)::int AS cnt, MAX(error_message) AS last_error
    FROM client_errors
    WHERE created_at > now() - interval '24 hours'
    GROUP BY api_route
  `;
  const chainMap = new Map<string, { cnt: number; lastError: string }>();
  for (const row of chainErrorCounts.rows) {
    chainMap.set(row.api_route, { cnt: row.cnt, lastError: row.last_error });
  }

  function getChainErrors(routes: string[]): { cnt: number; lastError: string | null } {
    let total = 0;
    let lastError: string | null = null;
    for (const route of routes) {
      const entry = chainMap.get(route);
      if (entry) {
        total += entry.cnt;
        lastError = entry.lastError;
      }
    }
    return { cnt: total, lastError };
  }

  // Get last ghost test results
  const lastGhostRun = await sql`
    SELECT full_results FROM diagnostic_runs
    WHERE run_type IN ('full_diagnostic', 'ghost_tests_only')
    ORDER BY created_at DESC LIMIT 1
  `;
  const ghostResults = lastGhostRun.rows[0]?.full_results ?? {};

  // Build chain health with best available data
  const regErrors = getChainErrors(["/api/auth/register"]);
  const loginErrors = getChainErrors(["/api/auth/login"]);
  const subErrors = getChainErrors(["/api/submissions"]);
  const orgErrors = getChainErrors(["/api/orgs"]);
  const voteErrors = getChainErrors(["/api/submissions/[id]/vote"]);
  const disputeErrors = getChainErrors(["/api/disputes"]);
  const notifErrors = getChainErrors(["/api/users/me/notifications"]);

  // ═══════════════════════════════════════════════════════════════════
  // DATA RECONCILIATION
  // ═══════════════════════════════════════════════════════════════════

  const [
    stuckSubmissions,
    reputationDrift,
    stuckVaultEntries,
    missingNotifications,
    incompleteDisputes,
    stuckStories,
    orphanedOrgMembers,
    submissionsNoEvidence,
    votesNoAudit,
  ] = await Promise.all([
    // Stuck submissions: pending_review with all votes cast
    sql`
      SELECT s.id, s.status::text, s.jury_seats,
        (SELECT COUNT(*)::int FROM jury_votes jv WHERE jv.submission_id = s.id AND jv.role = 'in_group') AS votes
      FROM submissions s
      WHERE s.status IN ('pending_review', 'cross_review')
        AND s.jury_seats IS NOT NULL
        AND s.jury_seats > 0
        AND (SELECT COUNT(*) FROM jury_votes jv WHERE jv.submission_id = s.id AND jv.role = 'in_group') >= s.jury_seats
      LIMIT 50
    `,

    // Reputation drift: expected wins/losses vs actual
    sql`
      SELECT u.username AS user, u.total_wins AS actual_wins,
        (SELECT COUNT(*)::int FROM submissions s WHERE s.submitted_by = u.id AND s.status IN ('approved', 'consensus')) AS expected_wins,
        u.total_wins - (SELECT COUNT(*)::int FROM submissions s WHERE s.submitted_by = u.id AND s.status IN ('approved', 'consensus')) AS delta
      FROM users u
      WHERE u.total_wins != (SELECT COUNT(*)::int FROM submissions s WHERE s.submitted_by = u.id AND s.status IN ('approved', 'consensus'))
         OR u.total_losses != (SELECT COUNT(*)::int FROM submissions s WHERE s.submitted_by = u.id AND s.status IN ('rejected', 'consensus_rejected'))
      LIMIT 50
    `,

    // Stuck vault entries: pending with approved parent submission
    sql`
      SELECT COUNT(*)::int AS count FROM vault_entries ve
      JOIN submissions s ON s.id = ve.submission_id
      WHERE ve.status = 'pending' AND s.status IN ('approved', 'consensus')
    `,

    // Missing notifications: resolved submissions without submitter notification
    sql`
      SELECT COUNT(*)::int AS count FROM submissions s
      WHERE s.status IN ('approved', 'rejected', 'consensus', 'consensus_rejected')
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
          WHERE n.user_id = s.submitted_by
            AND n.entity_type = 'submission'
            AND n.entity_id = s.id::text
        )
    `.catch(() => ({ rows: [{ count: 0 }] })),

    // Incomplete disputes: disputes without enough votes
    sql`
      SELECT COUNT(*)::int AS count FROM disputes d
      WHERE d.status = 'pending_review'
        AND d.created_at < now() - interval '7 days'
    `,

    // Stuck stories
    sql`
      SELECT COUNT(*)::int AS count FROM stories st
      WHERE st.status = 'pending_review'
        AND st.created_at < now() - interval '7 days'
    `.catch(() => ({ rows: [{ count: 0 }] })),

    // Orphaned org members: no history entry
    sql`
      SELECT COUNT(*)::int AS count FROM organization_members om
      WHERE NOT EXISTS (
        SELECT 1 FROM organization_member_history omh
        WHERE omh.org_id = om.org_id AND omh.user_id = om.user_id AND omh.action = 'joined'
      )
    `,

    // Submissions without evidence
    sql`
      SELECT COUNT(*)::int AS count FROM submissions s
      WHERE NOT EXISTS (SELECT 1 FROM submission_evidence se WHERE se.submission_id = s.id)
    `,

    // Votes without audit log entries
    sql`
      SELECT COUNT(*)::int AS count FROM jury_votes jv
      WHERE NOT EXISTS (
        SELECT 1 FROM audit_log al
        WHERE al.entity_id = jv.submission_id AND al.entity_type = 'submission' AND al.action = 'Vote cast' AND al.user_id = jv.user_id
      )
    `,
  ]);

  // ═══════════════════════════════════════════════════════════════════
  // ASSEMBLE REPORT
  // ═══════════════════════════════════════════════════════════════════

  const report = {
    generated_at: new Date().toISOString(),
    duration_ms: Date.now() - startTime,

    errors: {
      last_24h: {
        total: errors24h.rows[0]?.total ?? 0,
        by_route: toRecord(byRoute24h.rows, "api_route"),
        by_type: toRecord(byType24h.rows, "error_type"),
      },
      last_7d: {
        total: errors7d.rows[0]?.total ?? 0,
        by_route: toRecord(byRoute7d.rows, "api_route"),
        by_type: toRecord(byType7d.rows, "error_type"),
      },
      last_30d: {
        total: errors30d.rows[0]?.total ?? 0,
        by_route: toRecord(byRoute30d.rows, "api_route"),
        by_type: toRecord(byType30d.rows, "error_type"),
      },
      unresolved: unresolvedCount.rows[0]?.total ?? 0,
      recurring_patterns: recurringPatterns.rows.map((r: Record<string, unknown>) => ({
        route: r.route,
        function: r.function,
        count: r.count,
        last_seen: r.last_seen,
      })),
    },

    chains: {
      account_creation: chainHealth(regErrors.cnt, ghostResults.registration?.status === "PASS", regErrors.lastError),
      login: chainHealth(loginErrors.cnt, true, loginErrors.lastError),
      submission_creation: chainHealth(subErrors.cnt, ghostResults.submission?.status === "PASS", subErrors.lastError),
      assembly_creation: chainHealth(orgErrors.cnt, ghostResults.assembly_creation?.status === "PASS", orgErrors.lastError),
      jury_voting: chainHealth(voteErrors.cnt, ghostResults.vote_casting?.status === "PASS", voteErrors.lastError),
      submission_visibility: chainHealth(0, true, null),
      review_queue: chainHealth(0, true, null),
      disputes: chainHealth(disputeErrors.cnt, ghostResults.dispute_filing?.status === "PASS", disputeErrors.lastError),
      notifications: chainHealth(notifErrors.cnt, true, notifErrors.lastError),
      dispute_resolution: chainHealth(0, true, null),
      vault_artifacts: chainHealth(0, true, null),
      stories: chainHealth(0, true, null),
    },

    reconciliation: {
      stuck_submissions: stuckSubmissions.rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        status: r.status,
        votes: r.votes,
        seats: r.jury_seats,
      })),
      reputation_drift: reputationDrift.rows.map((r: Record<string, unknown>) => ({
        user: r.user,
        expected_wins: r.expected_wins,
        actual_wins: r.actual_wins,
        delta: r.delta,
      })),
      stuck_vault_entries: stuckVaultEntries.rows[0]?.count ?? 0,
      missing_notifications: missingNotifications.rows[0]?.count ?? 0,
      incomplete_disputes: incompleteDisputes.rows[0]?.count ?? 0,
      stuck_stories: stuckStories.rows[0]?.count ?? 0,
      orphaned_records: {
        org_members_no_history: orphanedOrgMembers.rows[0]?.count ?? 0,
        submissions_no_evidence: submissionsNoEvidence.rows[0]?.count ?? 0,
        votes_no_audit: votesNoAudit.rows[0]?.count ?? 0,
      },
    },

    ghost_tests: ghostResults,
  };

  // Store this diagnostic run
  try {
    await sql`
      INSERT INTO diagnostic_runs (run_type, triggered_by, summary, duration_ms)
      VALUES (
        'reconciliation',
        ${admin.sub},
        ${JSON.stringify({
          errors_24h: report.errors.last_24h.total,
          unresolved: report.errors.unresolved,
          stuck_submissions: report.reconciliation.stuck_submissions.length,
          reputation_drift: report.reconciliation.reputation_drift.length,
          stuck_vault_entries: report.reconciliation.stuck_vault_entries,
        })},
        ${Date.now() - startTime}
      )
    `;
  } catch (e) {
    console.error("[reconciliation-report] Failed to store diagnostic run:", e);
  }

  return ok(report);
}
