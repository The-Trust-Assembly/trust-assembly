import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden, serverError } from "@/lib/api-utils";

/**
 * POST /api/admin/test-jury-integrity
 *
 * Comprehensive jury integrity audit. Tests:
 *
 * 1. SELF-REVIEW: No one assigned to jury on their own submission
 * 2. DI-PARTNER REVIEW: No one reviewing their AI Agent's work (or vice versa)
 * 3. DISPUTE CONFLICTS: No one assigned to a dispute jury who voted on the original
 * 4. REPEAT JURORS: No one assigned to multiple dispute rounds on the same submission
 * 5. STATE TRANSITIONS: All submissions in valid states
 * 6. JURY COMPLETENESS: Pending submissions have adequate jury assignments
 * 7. STALE ASSIGNMENTS: Jurors who accepted but never voted (potential timeout candidates)
 * 8. RESOLUTION INTEGRITY: Resolved submissions have matching vote counts
 * 9. ERROR DETECTION: Submissions stuck in intermediate states
 */

interface TestResult {
  name: string;
  status: "pass" | "fail" | "warn";
  count: number;
  details: string[];
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  try {
    const startTime = Date.now();
    const results: TestResult[] = [];

    // ── TEST 1: Self-Review Detection ──
    // No juror should be assigned to review their own submission
    const selfReview = await sql`
      SELECT ja.id, ja.submission_id, ja.user_id, u.username,
             s.submitted_by, su.username AS submitter_username
      FROM jury_assignments ja
      JOIN submissions s ON s.id = ja.submission_id
      JOIN users u ON u.id = ja.user_id
      JOIN users su ON su.id = s.submitted_by
      WHERE ja.submission_id IS NOT NULL
        AND ja.user_id = s.submitted_by
    `;
    results.push({
      name: "Self-Review Detection",
      status: selfReview.rows.length === 0 ? "pass" : "fail",
      count: selfReview.rows.length,
      details: selfReview.rows.slice(0, 10).map((r: Record<string, unknown>) =>
        `@${r.username} assigned to review own submission ${(r.submission_id as string).slice(0, 8)}...`
      ),
    });

    // ── TEST 2: DI Partner Cross-Review ──
    // No one should review their AI Agent partner's submission
    const diPartnerReview = await sql`
      SELECT ja.id, ja.submission_id, ja.user_id, u.username,
             s.di_partner_id, dp.username AS partner_username
      FROM jury_assignments ja
      JOIN submissions s ON s.id = ja.submission_id
      JOIN users u ON u.id = ja.user_id
      LEFT JOIN users dp ON dp.id = s.di_partner_id
      WHERE ja.submission_id IS NOT NULL
        AND s.di_partner_id IS NOT NULL
        AND ja.user_id = s.di_partner_id
    `;
    results.push({
      name: "AI Agent Partner Cross-Review",
      status: diPartnerReview.rows.length === 0 ? "pass" : "fail",
      count: diPartnerReview.rows.length,
      details: diPartnerReview.rows.slice(0, 10).map((r: Record<string, unknown>) =>
        `@${r.username} (AI partner) assigned to review submission ${(r.submission_id as string).slice(0, 8)}...`
      ),
    });

    // ── TEST 3: DI Account on Jury ──
    // AI Agent accounts should never be assigned to juries
    const diOnJury = await sql`
      SELECT ja.id, ja.user_id, u.username, u.is_di,
             ja.submission_id, ja.dispute_id
      FROM jury_assignments ja
      JOIN users u ON u.id = ja.user_id
      WHERE u.is_di = TRUE
    `;
    results.push({
      name: "AI Agent Accounts on Jury",
      status: diOnJury.rows.length === 0 ? "pass" : "fail",
      count: diOnJury.rows.length,
      details: diOnJury.rows.slice(0, 10).map((r: Record<string, unknown>) =>
        `AI Agent @${r.username} assigned to ${r.submission_id ? 'submission' : 'dispute'} jury`
      ),
    });

    // ── TEST 4: Dispute Jurors Who Voted on Original Submission ──
    // Anyone who voted on the original submission should be excluded from dispute jury
    const disputeConflict = await sql`
      SELECT ja.id, ja.dispute_id, ja.user_id, u.username,
             d.submission_id
      FROM jury_assignments ja
      JOIN disputes d ON d.id = ja.dispute_id
      JOIN users u ON u.id = ja.user_id
      WHERE ja.dispute_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM jury_votes jv
          WHERE jv.submission_id = d.submission_id
            AND jv.user_id = ja.user_id
            AND jv.role IN ('in_group', 'cross_group')
        )
    `;
    results.push({
      name: "Dispute Jurors Who Voted on Original",
      status: disputeConflict.rows.length === 0 ? "pass" : "fail",
      count: disputeConflict.rows.length,
      details: disputeConflict.rows.slice(0, 10).map((r: Record<string, unknown>) =>
        `@${r.username} voted on submission ${(r.submission_id as string).slice(0, 8)}... AND assigned to its dispute ${(r.dispute_id as string).slice(0, 8)}...`
      ),
    });

    // ── TEST 5: Disputer/Submitter on Own Dispute Jury ──
    // Neither the person who filed the dispute nor the original submitter should be on the dispute jury
    const disputeSelfReview = await sql`
      SELECT ja.id, ja.dispute_id, ja.user_id, u.username,
             d.disputed_by, d.original_submitter
      FROM jury_assignments ja
      JOIN disputes d ON d.id = ja.dispute_id
      JOIN users u ON u.id = ja.user_id
      WHERE ja.dispute_id IS NOT NULL
        AND (ja.user_id = d.disputed_by OR ja.user_id = d.original_submitter)
    `;
    results.push({
      name: "Disputer/Submitter on Own Dispute Jury",
      status: disputeSelfReview.rows.length === 0 ? "pass" : "fail",
      count: disputeSelfReview.rows.length,
      details: disputeSelfReview.rows.slice(0, 10).map((r: Record<string, unknown>) =>
        `@${r.username} is ${r.user_id === r.disputed_by ? 'disputer' : 'original submitter'} AND on dispute jury ${(r.dispute_id as string).slice(0, 8)}...`
      ),
    });

    // ── TEST 6: Repeat Jurors Across Dispute Rounds ──
    // Same person should not serve on multiple dispute rounds for the same submission
    const repeatDisputeJurors = await sql`
      SELECT ja.user_id, u.username, d.submission_id,
             COUNT(DISTINCT d.id) AS dispute_count,
             ARRAY_AGG(DISTINCT d.id) AS dispute_ids
      FROM jury_assignments ja
      JOIN disputes d ON d.id = ja.dispute_id
      JOIN users u ON u.id = ja.user_id
      WHERE ja.dispute_id IS NOT NULL
      GROUP BY ja.user_id, u.username, d.submission_id
      HAVING COUNT(DISTINCT d.id) > 1
    `;
    results.push({
      name: "Repeat Jurors Across Dispute Rounds",
      status: repeatDisputeJurors.rows.length === 0 ? "pass" : "warn",
      count: repeatDisputeJurors.rows.length,
      details: repeatDisputeJurors.rows.slice(0, 10).map((r: Record<string, unknown>) =>
        `@${r.username} served on ${r.dispute_count} dispute rounds for submission ${(r.submission_id as string).slice(0, 8)}...`
      ),
    });

    // ── TEST 7: Valid State Transitions ──
    // Check for submissions in unexpected states
    const invalidStates = await sql`
      SELECT s.id, s.status, s.resolved_at, s.jury_seats,
             (SELECT COUNT(*) FROM jury_votes jv WHERE jv.submission_id = s.id) AS vote_count,
             (SELECT COUNT(*) FROM jury_assignments ja WHERE ja.submission_id = s.id) AS assignment_count
      FROM submissions s
      WHERE
        -- Resolved without any votes
        (s.status IN ('approved', 'rejected', 'consensus', 'consensus_rejected') AND s.trusted_skip = FALSE
         AND (SELECT COUNT(*) FROM jury_votes jv WHERE jv.submission_id = s.id) = 0)
        OR
        -- Has resolved_at but status is still pending
        (s.resolved_at IS NOT NULL AND s.status IN ('pending_review', 'pending_jury', 'cross_review'))
        OR
        -- In review but has no jury assignments
        (s.status = 'pending_review' AND s.trusted_skip = FALSE
         AND (SELECT COUNT(*) FROM jury_assignments ja WHERE ja.submission_id = s.id) = 0)
      LIMIT 50
    `;
    results.push({
      name: "Invalid State Transitions",
      status: invalidStates.rows.length === 0 ? "pass" : "fail",
      count: invalidStates.rows.length,
      details: invalidStates.rows.slice(0, 10).map((r: Record<string, unknown>) =>
        `${(r.id as string).slice(0, 8)}... status=${r.status} resolved_at=${r.resolved_at ? 'SET' : 'NULL'} votes=${r.vote_count} assignments=${r.assignment_count}`
      ),
    });

    // ── TEST 8: Stale Jury Assignments ──
    // Jurors who accepted more than 24 hours ago but haven't voted (timeout candidates)
    const staleAssignments = await sql`
      SELECT ja.id, ja.submission_id, ja.dispute_id, ja.user_id, u.username,
             ja.accepted_at, s.status AS sub_status
      FROM jury_assignments ja
      JOIN users u ON u.id = ja.user_id
      LEFT JOIN submissions s ON s.id = ja.submission_id
      WHERE ja.accepted = TRUE
        AND ja.accepted_at < now() - interval '24 hours'
        AND (s.status IN ('pending_review', 'cross_review') OR ja.dispute_id IS NOT NULL)
        AND NOT EXISTS (
          SELECT 1 FROM jury_votes jv
          WHERE (jv.submission_id = ja.submission_id OR jv.dispute_id = ja.dispute_id)
            AND jv.user_id = ja.user_id
        )
    `;
    results.push({
      name: "Stale Jury Assignments (accepted >24h, no vote)",
      status: staleAssignments.rows.length === 0 ? "pass" : "warn",
      count: staleAssignments.rows.length,
      details: staleAssignments.rows.slice(0, 10).map((r: Record<string, unknown>) => {
        const target = r.submission_id ? `sub ${(r.submission_id as string).slice(0, 8)}...` : `dispute ${(r.dispute_id as string).slice(0, 8)}...`;
        const hours = Math.round((Date.now() - new Date(r.accepted_at as string).getTime()) / (1000 * 60 * 60));
        return `@${r.username} accepted ${target} ${hours}h ago, no vote`;
      }),
    });

    // ── TEST 9: Resolution Vote Count Integrity ──
    // Resolved submissions should have votes matching the verdict
    const resolutionIntegrity = await sql`
      SELECT s.id, s.status, s.jury_seats,
        (SELECT COUNT(*) FILTER (WHERE approve = TRUE) FROM jury_votes jv WHERE jv.submission_id = s.id AND jv.role = 'in_group') AS approve_count,
        (SELECT COUNT(*) FILTER (WHERE approve = FALSE) FROM jury_votes jv WHERE jv.submission_id = s.id AND jv.role = 'in_group') AS reject_count
      FROM submissions s
      WHERE s.status IN ('approved', 'rejected')
        AND s.trusted_skip = FALSE
        AND s.jury_seats IS NOT NULL
        AND s.jury_seats > 0
    `;
    const badResolutions = resolutionIntegrity.rows.filter((r: Record<string, unknown>) => {
      const majority = Math.floor((r.jury_seats as number) / 2) + 1;
      if (r.status === "approved" && (r.approve_count as number) < majority) return true;
      if (r.status === "rejected" && (r.reject_count as number) < majority) return true;
      return false;
    });
    results.push({
      name: "Resolution Vote Count Integrity",
      status: badResolutions.length === 0 ? "pass" : "fail",
      count: badResolutions.length,
      details: badResolutions.slice(0, 10).map((r: Record<string, unknown>) =>
        `${(r.id as string).slice(0, 8)}... ${r.status} but votes: ${r.approve_count}/${r.reject_count} (need ${Math.floor((r.jury_seats as number) / 2) + 1} for majority of ${r.jury_seats})`
      ),
    });

    // ── TEST 10: Error States — Submissions Stuck in Transition ──
    // Submissions that have been in pending_review for >7 days with no votes
    const stuckSubmissions = await sql`
      SELECT s.id, s.status, s.created_at, s.jury_seats,
        (SELECT COUNT(*) FROM jury_votes jv WHERE jv.submission_id = s.id) AS vote_count,
        (SELECT COUNT(*) FROM jury_assignments ja WHERE ja.submission_id = s.id AND ja.accepted = TRUE) AS accepted_count
      FROM submissions s
      WHERE s.status IN ('pending_review', 'cross_review')
        AND s.created_at < now() - interval '7 days'
        AND (SELECT COUNT(*) FROM jury_votes jv WHERE jv.submission_id = s.id) = 0
      LIMIT 50
    `;
    results.push({
      name: "Stuck Submissions (>7 days, 0 votes)",
      status: stuckSubmissions.rows.length === 0 ? "pass" : "warn",
      count: stuckSubmissions.rows.length,
      details: stuckSubmissions.rows.slice(0, 10).map((r: Record<string, unknown>) => {
        const days = Math.round((Date.now() - new Date(r.created_at as string).getTime()) / (1000 * 60 * 60 * 24));
        return `${(r.id as string).slice(0, 8)}... ${r.status} for ${days} days, 0 votes, ${r.accepted_count} accepted jurors, ${r.jury_seats} seats`;
      }),
    });

    // ── TEST 11: Dispute State Integrity ──
    // Disputes that have been pending_review for >14 days
    const stuckDisputes = await sql`
      SELECT d.id, d.submission_id, d.status, d.created_at, d.dispute_round, d.stake_points,
        (SELECT COUNT(*) FROM jury_votes jv WHERE jv.dispute_id = d.id) AS vote_count,
        (SELECT COUNT(*) FROM jury_assignments ja WHERE ja.dispute_id = d.id) AS juror_count
      FROM disputes d
      WHERE d.status = 'pending_review'
        AND d.created_at < now() - interval '14 days'
      LIMIT 50
    `;
    results.push({
      name: "Stuck Disputes (>14 days pending)",
      status: stuckDisputes.rows.length === 0 ? "pass" : "warn",
      count: stuckDisputes.rows.length,
      details: stuckDisputes.rows.slice(0, 10).map((r: Record<string, unknown>) => {
        const days = Math.round((Date.now() - new Date(r.created_at as string).getTime()) / (1000 * 60 * 60 * 24));
        return `${(r.id as string).slice(0, 8)}... round ${r.dispute_round}, ${r.stake_points} pts, ${days} days, ${r.vote_count} votes, ${r.juror_count} jurors`;
      }),
    });

    // ── TEST 12: Duplicate Votes ──
    // Same user voted twice on same submission/dispute
    const duplicateVotes = await sql`
      SELECT user_id, submission_id, dispute_id, role, COUNT(*) AS vote_count, u.username
      FROM jury_votes jv
      JOIN users u ON u.id = jv.user_id
      GROUP BY user_id, submission_id, dispute_id, role, u.username
      HAVING COUNT(*) > 1
      LIMIT 50
    `;
    results.push({
      name: "Duplicate Votes",
      status: duplicateVotes.rows.length === 0 ? "pass" : "fail",
      count: duplicateVotes.rows.length,
      details: duplicateVotes.rows.slice(0, 10).map((r: Record<string, unknown>) =>
        `@${r.username} voted ${r.vote_count}x on ${r.submission_id ? 'submission' : 'dispute'} ${((r.submission_id || r.dispute_id) as string).slice(0, 8)}... (${r.role})`
      ),
    });

    // Summary
    const passed = results.filter(r => r.status === "pass").length;
    const failed = results.filter(r => r.status === "fail").length;
    const warned = results.filter(r => r.status === "warn").length;

    return ok({
      summary: { total: results.length, passed, failed, warned, durationMs: Date.now() - startTime },
      tests: results,
    });
  } catch (e) {
    return serverError("POST /api/admin/test-jury-integrity", e);
  }
}
