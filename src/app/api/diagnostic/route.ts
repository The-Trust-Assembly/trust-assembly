import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden, err } from "@/lib/api-utils";

// GET /api/diagnostic — comprehensive health & activity report
// Admin-only. Returns backend action log, error summary, data-shape
// validation, and frontend-relevant warnings.
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Diagnostic report requires admin access");

  const { searchParams } = new URL(request.url);
  const hoursBack = Math.min(parseInt(searchParams.get("hours") || "24"), 168); // max 7 days
  const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

  const report: Record<string, unknown> = {};

  // ── Section A: Recent Actions (success vs error breakdown) ──
  try {
    const actions = await sql`
      SELECT
        action,
        entity_type,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE metadata::text LIKE '%"status":"error"%') as errors,
        COUNT(*) FILTER (WHERE metadata::text LIKE '%"status":"denied"%') as denied,
        COUNT(*) FILTER (WHERE metadata::text LIKE '%"status":"success"%') as successes,
        MIN(created_at) as first_seen,
        MAX(created_at) as last_seen
      FROM audit_log
      WHERE created_at >= ${cutoff}
      GROUP BY action, entity_type
      ORDER BY total DESC
      LIMIT 100
    `;
    report.actionSummary = actions.rows;
  } catch (e) {
    report.actionSummary = { error: (e as Error).message };
  }

  // ── Section B: Recent Errors (detailed) ──
  try {
    const errors = await sql`
      SELECT
        al.id, al.action, al.entity_type, al.entity_id,
        al.metadata, al.created_at,
        u.username
      FROM audit_log al
      LEFT JOIN users u ON u.id = al.user_id
      WHERE al.created_at >= ${cutoff}
        AND (al.metadata::text LIKE '%"status":"error"%'
          OR al.metadata::text LIKE '%"errorMessage"%')
      ORDER BY al.created_at DESC
      LIMIT 50
    `;
    report.recentErrors = errors.rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      username: r.username,
      createdAt: r.created_at,
      errorMessage: (r.metadata as Record<string, unknown>)?.errorMessage ?? null,
      errorStack: (r.metadata as Record<string, unknown>)?.errorStack ?? null,
      requestPath: (r.metadata as Record<string, unknown>)?.requestPath ?? null,
      durationMs: (r.metadata as Record<string, unknown>)?.durationMs ?? null,
    }));
  } catch (e) {
    report.recentErrors = { error: (e as Error).message };
  }

  // ── Section C: Data Shape Validation (catch page-crash bugs) ──
  const dataIssues: Array<{ check: string; severity: string; count: number; details: string }> = [];

  try {
    // Submissions missing required UI fields
    const nullFields = await sql`
      SELECT COUNT(*) as cnt FROM submissions
      WHERE status IS NULL OR org_id IS NULL
    `;
    if (parseInt(nullFields.rows[0].cnt) > 0) {
      dataIssues.push({
        check: "submissions_null_required_fields",
        severity: "critical",
        count: parseInt(nullFields.rows[0].cnt),
        details: "Submissions with NULL status or org_id — will crash ReviewScreen",
      });
    }

    // Submissions in review states with no jury
    const noJury = await sql`
      SELECT COUNT(*) as cnt FROM submissions s
      WHERE s.status IN ('pending_review', 'cross_review')
        AND NOT EXISTS (
          SELECT 1 FROM jury_assignments ja
          WHERE ja.submission_id = s.id AND ja.accepted = TRUE
        )
    `;
    if (parseInt(noJury.rows[0].cnt) > 0) {
      dataIssues.push({
        check: "submissions_no_jury_while_reviewing",
        severity: "warning",
        count: parseInt(noJury.rows[0].cnt),
        details: "Submissions in review status but no accepted jurors — jury progress bar will show 0/0",
      });
    }

    // Orphaned jury assignments
    const orphanedJury = await sql`
      SELECT COUNT(*) as cnt FROM jury_assignments ja
      WHERE NOT EXISTS (SELECT 1 FROM submissions s WHERE s.id = ja.submission_id)
    `;
    if (parseInt(orphanedJury.rows[0].cnt) > 0) {
      dataIssues.push({
        check: "orphaned_jury_assignments",
        severity: "warning",
        count: parseInt(orphanedJury.rows[0].cnt),
        details: "Jury assignments pointing to non-existent submissions — phantom review queue items",
      });
    }

    // Votes with null approve field
    const nullVotes = await sql`
      SELECT COUNT(*) as cnt FROM jury_votes
      WHERE approve IS NULL
    `;
    if (parseInt(nullVotes.rows[0].cnt) > 0) {
      dataIssues.push({
        check: "votes_null_approve",
        severity: "critical",
        count: parseInt(nullVotes.rows[0].cnt),
        details: "Votes with NULL approve field — vote tallying will produce wrong results",
      });
    }

    // Users with null username
    const nullUsername = await sql`
      SELECT COUNT(*) as cnt FROM users WHERE username IS NULL OR username = ''
    `;
    if (parseInt(nullUsername.rows[0].cnt) > 0) {
      dataIssues.push({
        check: "users_null_username",
        severity: "critical",
        count: parseInt(nullUsername.rows[0].cnt),
        details: "Users with empty username — will crash profile lookups and display",
      });
    }

    // DI submissions with no diPartner
    const diNoParter = await sql`
      SELECT COUNT(*) as cnt FROM submissions
      WHERE is_di = TRUE AND di_partner_id IS NULL
    `;
    if (parseInt(diNoParter.rows[0].cnt) > 0) {
      dataIssues.push({
        check: "di_submissions_no_partner",
        severity: "warning",
        count: parseInt(diNoParter.rows[0].cnt),
        details: "DI submissions with no di_partner set — DI approval workflow will fail",
      });
    }
  } catch (e) {
    dataIssues.push({
      check: "data_validation_query_failed",
      severity: "critical",
      count: 1,
      details: (e as Error).message,
    });
  }
  report.dataIssues = dataIssues;

  // ── Section D: Table Row Counts (quick health overview) ──
  try {
    const counts = await sql`
      SELECT
        (SELECT COUNT(*) FROM users) as users,
        (SELECT COUNT(*) FROM organizations) as orgs,
        (SELECT COUNT(*) FROM submissions) as submissions,
        (SELECT COUNT(*) FROM jury_assignments) as jury_assignments,
        (SELECT COUNT(*) FROM jury_votes) as jury_votes,
        (SELECT COUNT(*) FROM audit_log) as audit_entries,
        (SELECT COUNT(*) FROM audit_log WHERE created_at >= ${cutoff}) as audit_entries_period
    `;
    report.tableCounts = counts.rows[0];
  } catch (e) {
    report.tableCounts = { error: (e as Error).message };
  }

  // ── Section E: Submission Status Distribution ──
  try {
    const dist = await sql`
      SELECT status, COUNT(*) as count
      FROM submissions
      GROUP BY status
      ORDER BY count DESC
    `;
    report.submissionStatusDistribution = dist.rows;
  } catch (e) {
    report.submissionStatusDistribution = { error: (e as Error).message };
  }

  // ── Section F: Slow Actions (> 1s response time) ──
  try {
    const slow = await sql`
      SELECT
        action, entity_type, entity_id,
        (metadata->>'durationMs')::int as duration_ms,
        metadata->>'requestPath' as request_path,
        created_at
      FROM audit_log
      WHERE created_at >= ${cutoff}
        AND (metadata->>'durationMs')::int > 1000
      ORDER BY (metadata->>'durationMs')::int DESC
      LIMIT 20
    `;
    report.slowActions = slow.rows;
  } catch (e) {
    report.slowActions = { error: (e as Error).message };
  }

  // ── Section G: KV Store Usage (deprecated endpoint hits) ──
  try {
    const kvHits = await sql`
      SELECT COUNT(*) as cnt
      FROM audit_log
      WHERE action LIKE '%KV%' AND created_at >= ${cutoff}
    `;
    report.deprecatedKvHits = parseInt(kvHits.rows[0].cnt);
  } catch (e) {
    report.deprecatedKvHits = { error: (e as Error).message };
  }

  // ── Section H: Client-Reported Errors (from action-tracker flush) ──
  try {
    const clientErrors = await sql`
      SELECT metadata, created_at
      FROM audit_log
      WHERE entity_type = 'client_action_log'
        AND created_at >= ${cutoff}
      ORDER BY created_at DESC
      LIMIT 10
    `;
    report.clientActionLogs = clientErrors.rows;
  } catch (e) {
    report.clientActionLogs = { error: (e as Error).message };
  }

  report.generatedAt = new Date().toISOString();
  report.periodHours = hoursBack;

  return ok(report);
}
