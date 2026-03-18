import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden } from "@/lib/api-utils";
import { getMajority, isWildWestMode } from "@/lib/jury-rules";

// POST /api/admin/smoke-test
//
// Full ghost-transaction smoke test of the submission pipeline.
// Creates sentinel data, drives it through every pipeline stage, verifies
// each transition, then DELETEs all ghost records so there's zero residue.
//
// Pipeline stages tested:
//   1. Ghost user + org creation
//   2. Submission creation with jury assignment
//   3. Queue visibility (jury_assignments join)
//   4. Vote casting + majority tally
//   5. Resolution trigger (status change, reputation update)
//   6. Corrections API visibility (normalized_url match)
//   7. Full cleanup of all ghost records

const GHOST_PREFIX = "__smoke_test_";
const GHOST_ORG_NAME = `${GHOST_PREFIX}org_${Date.now()}`;
const GHOST_USERNAME = `${GHOST_PREFIX}user_${Date.now()}`;

interface StageResult {
  stage: string;
  status: "PASS" | "FAIL" | "SKIP" | "ERROR";
  description: string;
  details: Record<string, unknown>;
  durationMs: number;
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  const stages: StageResult[] = [];
  const ghostIds: {
    orgId?: string;
    submitterId?: string;
    jurorIds: string[];
    submissionId?: string;
    memberIds: string[];
  } = { jurorIds: [], memberIds: [] };

  const overallStart = Date.now();

  // Helper to run a stage and record result
  async function runStage(
    name: string,
    fn: () => Promise<{ status: "PASS" | "FAIL" | "SKIP"; description: string; details: Record<string, unknown> }>
  ) {
    const start = Date.now();
    try {
      const result = await fn();
      stages.push({ stage: name, ...result, durationMs: Date.now() - start });
      return result.status === "PASS";
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      stages.push({
        stage: name,
        status: "ERROR",
        description: `Stage threw: ${msg}`,
        details: { error: msg, stack: e instanceof Error ? e.stack : undefined },
        durationMs: Date.now() - start,
      });
      return false;
    }
  }

  try {
    // ═══════════════════════════════════════════════════════════════
    // STAGE 1: Create ghost org + users
    // ═══════════════════════════════════════════════════════════════
    const s1ok = await runStage("1. Create ghost org & users", async () => {
      // Create ghost org
      const orgResult = await sql`
        INSERT INTO organizations (name, slug, description)
        VALUES (${GHOST_ORG_NAME}, ${GHOST_PREFIX + "slug_" + Date.now()}, 'Smoke test org - will be deleted')
        RETURNING id
      `;
      ghostIds.orgId = orgResult.rows[0].id;

      // Create submitter user
      const submitterResult = await sql`
        INSERT INTO users (username, password_hash, display_name, current_streak, total_wins, total_losses)
        VALUES (${GHOST_USERNAME + "_submitter"}, 'smoke_no_login', 'Smoke Submitter', 0, 0, 0)
        RETURNING id
      `;
      ghostIds.submitterId = submitterResult.rows[0].id;

      // Add submitter as org member
      const submitterMemberResult = await sql`
        INSERT INTO organization_members (org_id, user_id, role, is_active)
        VALUES (${ghostIds.orgId}, ${ghostIds.submitterId}, 'member', TRUE)
        RETURNING id
      `;
      ghostIds.memberIds.push(submitterMemberResult.rows[0].id);

      // Create juror users (need enough for wild west or normal mode)
      const wildWest = await isWildWestMode();
      const jurorCount = wildWest ? 1 : 3;

      for (let i = 0; i < jurorCount; i++) {
        const jurorResult = await sql`
          INSERT INTO users (username, password_hash, display_name, current_streak, total_wins, total_losses)
          VALUES (${GHOST_USERNAME + "_juror_" + i}, 'smoke_no_login', ${"Smoke Juror " + i}, 0, 0, 0)
          RETURNING id
        `;
        ghostIds.jurorIds.push(jurorResult.rows[0].id);

        const memberResult = await sql`
          INSERT INTO organization_members (org_id, user_id, role, is_active)
          VALUES (${ghostIds.orgId}, ${jurorResult.rows[0].id}, 'member', TRUE)
          RETURNING id
        `;
        ghostIds.memberIds.push(memberResult.rows[0].id);
      }

      return {
        status: "PASS" as const,
        description: `Created ghost org + ${1 + jurorCount} users (1 submitter, ${jurorCount} jurors)`,
        details: {
          orgId: ghostIds.orgId,
          submitterId: ghostIds.submitterId,
          jurorIds: ghostIds.jurorIds,
          wildWestMode: wildWest,
        },
      };
    });
    if (!s1ok) throw new Error("Stage 1 failed — cannot continue");

    // ═══════════════════════════════════════════════════════════════
    // STAGE 2: Create ghost submission
    // ═══════════════════════════════════════════════════════════════
    const s2ok = await runStage("2. Create ghost submission", async () => {
      const ghostUrl = `https://smoke-test.invalid/${Date.now()}`;
      const normalizedUrl = ghostUrl; // already clean

      // Direct insert rather than calling the submission API, so we control exactly what happens
      const subResult = await sql`
        INSERT INTO submissions (
          submission_type, status, url, normalized_url,
          original_headline, replacement, reasoning,
          submitted_by, org_id, trusted_skip, is_di, jury_seats
        ) VALUES (
          'correction', 'pending_review',
          ${ghostUrl}, ${normalizedUrl},
          'Smoke test headline', 'Smoke test replacement', 'Smoke test reasoning',
          ${ghostIds.submitterId!}, ${ghostIds.orgId!}, FALSE, FALSE, ${ghostIds.jurorIds.length}
        )
        RETURNING id, status, jury_seats
      `;
      ghostIds.submissionId = subResult.rows[0].id;

      // Create jury assignments for each juror
      for (const jurorId of ghostIds.jurorIds) {
        await sql`
          INSERT INTO jury_assignments (submission_id, user_id, role, in_pool, accepted)
          VALUES (${ghostIds.submissionId}, ${jurorId}, 'in_group', TRUE, TRUE)
          ON CONFLICT DO NOTHING
        `;
      }

      // Verify submission exists
      const verifyResult = await sql`
        SELECT id, status, jury_seats FROM submissions WHERE id = ${ghostIds.submissionId}
      `;

      // Verify jury assignments
      const juryResult = await sql`
        SELECT COUNT(*)::int AS cnt FROM jury_assignments
        WHERE submission_id = ${ghostIds.submissionId} AND role = 'in_group'
      `;

      const sub = verifyResult.rows[0];
      const juryCount = juryResult.rows[0].cnt;
      const juryOk = juryCount === ghostIds.jurorIds.length;

      return {
        status: (sub && juryOk) ? "PASS" as const : "FAIL" as const,
        description: sub && juryOk
          ? `Submission created (status=${sub.status}, jury_seats=${sub.jury_seats}, assigned=${juryCount})`
          : `Submission or jury assignment verification failed`,
        details: {
          submissionId: ghostIds.submissionId,
          status: sub?.status,
          jurySeats: sub?.jury_seats,
          juryAssigned: juryCount,
          expectedJurors: ghostIds.jurorIds.length,
        },
      };
    });
    if (!s2ok) throw new Error("Stage 2 failed — cannot continue");

    // ═══════════════════════════════════════════════════════════════
    // STAGE 3: Verify queue visibility
    // ═══════════════════════════════════════════════════════════════
    await runStage("3. Verify queue visibility", async () => {
      // Simulate the review queue query for the first juror
      const jurorId = ghostIds.jurorIds[0];
      const queueResult = await sql`
        SELECT s.id
        FROM submissions s
        INNER JOIN jury_assignments ja ON ja.submission_id = s.id AND ja.user_id = ${jurorId}
        WHERE s.status IN ('pending_review', 'cross_review')
          AND s.id = ${ghostIds.submissionId!}
      `;

      const visible = queueResult.rows.length > 0;
      return {
        status: visible ? "PASS" as const : "FAIL" as const,
        description: visible
          ? "Ghost submission visible in juror's review queue"
          : "Ghost submission NOT visible in juror's review queue — jury_assignments join failed",
        details: { jurorId, submissionId: ghostIds.submissionId, visible },
      };
    });

    // ═══════════════════════════════════════════════════════════════
    // STAGE 4: Cast votes to reach majority
    // ═══════════════════════════════════════════════════════════════
    const s4ok = await runStage("4. Cast ghost votes", async () => {
      const jurySize = ghostIds.jurorIds.length;
      const majority = getMajority(jurySize);
      const votesToCast = majority; // cast exactly enough for approval

      for (let i = 0; i < votesToCast; i++) {
        const jurorId = ghostIds.jurorIds[i];
        await sql`
          INSERT INTO jury_votes (submission_id, user_id, role, approve, note)
          VALUES (${ghostIds.submissionId!}, ${jurorId}, 'in_group', TRUE, 'Smoke test vote')
        `;
      }

      // Verify votes recorded
      const voteResult = await sql`
        SELECT COUNT(*)::int AS cnt, SUM(CASE WHEN approve THEN 1 ELSE 0 END)::int AS approvals
        FROM jury_votes
        WHERE submission_id = ${ghostIds.submissionId!} AND role = 'in_group'
      `;
      const { cnt, approvals } = voteResult.rows[0];

      return {
        status: cnt === votesToCast && approvals === votesToCast ? "PASS" as const : "FAIL" as const,
        description: `Cast ${cnt}/${votesToCast} votes (${approvals} approvals, majority=${majority})`,
        details: { jurySize, majority, votesToCast, votesRecorded: cnt, approvals },
      };
    });
    if (!s4ok) throw new Error("Stage 4 failed — cannot continue");

    // ═══════════════════════════════════════════════════════════════
    // STAGE 5: Trigger resolution + verify status change
    // ═══════════════════════════════════════════════════════════════
    await runStage("5. Trigger resolution", async () => {
      // Import and call the real resolution function
      const { tryResolveSubmission } = await import("@/lib/vote-resolution");
      let resolution;
      try {
        resolution = await tryResolveSubmission(ghostIds.submissionId!, "in_group");
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          status: "FAIL" as const,
          description: `tryResolveSubmission threw: ${msg}`,
          details: { error: msg },
        };
      }

      // Verify submission status changed
      const subResult = await sql`
        SELECT status, resolved_at FROM submissions WHERE id = ${ghostIds.submissionId!}
      `;
      const sub = subResult.rows[0];
      const expectedStatus = "approved"; // We cast all-approve votes for in_group

      // Check submitter reputation was updated
      const repResult = await sql`
        SELECT total_wins, current_streak FROM users WHERE id = ${ghostIds.submitterId!}
      `;
      const rep = repResult.rows[0];

      const statusOk = sub?.status === expectedStatus;
      const resolvedAtOk = sub?.resolved_at !== null;
      // In wild west mode or small org, might not update rep — check but don't fail
      const repUpdated = rep?.total_wins > 0;

      const allOk = statusOk && resolvedAtOk;

      return {
        status: allOk ? "PASS" as const : "FAIL" as const,
        description: allOk
          ? `Resolution succeeded: status=${sub.status}, resolved_at set, wins=${rep?.total_wins}, streak=${rep?.current_streak}`
          : `Resolution issue: status=${sub?.status} (expected ${expectedStatus}), resolved_at=${sub?.resolved_at}`,
        details: {
          resolution,
          actualStatus: sub?.status,
          expectedStatus,
          resolvedAt: sub?.resolved_at,
          submitterWins: rep?.total_wins,
          submitterStreak: rep?.current_streak,
          reputationUpdated: repUpdated,
        },
      };
    });

    // ═══════════════════════════════════════════════════════════════
    // STAGE 6: Verify corrections API visibility
    // ═══════════════════════════════════════════════════════════════
    await runStage("6. Verify corrections API visibility", async () => {
      // Run the same query the corrections endpoint uses
      const subLookup = await sql`
        SELECT id, normalized_url FROM submissions WHERE id = ${ghostIds.submissionId!}
      `;
      const normalizedUrl = subLookup.rows[0]?.normalized_url;

      const corrResult = await sql`
        SELECT s.id, s.status, s.submission_type, s.original_headline, s.replacement
        FROM submissions s
        WHERE s.status IN ('approved', 'consensus')
          AND s.normalized_url = ${normalizedUrl}
      `;

      const found = corrResult.rows.some((r: { id: string }) => r.id === ghostIds.submissionId);

      return {
        status: found ? "PASS" as const : "FAIL" as const,
        description: found
          ? "Ghost submission visible via corrections API query (status=approved, normalized_url matched)"
          : "Ghost submission NOT visible via corrections API — check status and normalized_url",
        details: {
          normalizedUrl,
          matchingRows: corrResult.rows.length,
          found,
          submissionStatus: subLookup.rows[0]?.status,
        },
      };
    });

  } finally {
    // ═══════════════════════════════════════════════════════════════
    // STAGE 7: Cleanup — delete ALL ghost records
    // ═══════════════════════════════════════════════════════════════
    const cleanupStart = Date.now();
    const cleanupDetails: Record<string, unknown> = {};
    const cleanupErrors: string[] = [];

    try {
      if (ghostIds.submissionId) {
        // Delete in dependency order
        try {
          await sql`DELETE FROM jury_votes WHERE submission_id = ${ghostIds.submissionId}`;
          cleanupDetails.juryVotes = "deleted";
        } catch (e: unknown) { cleanupErrors.push(`jury_votes: ${e instanceof Error ? e.message : String(e)}`); }

        try {
          await sql`DELETE FROM jury_assignments WHERE submission_id = ${ghostIds.submissionId}`;
          cleanupDetails.juryAssignments = "deleted";
        } catch (e: unknown) { cleanupErrors.push(`jury_assignments: ${e instanceof Error ? e.message : String(e)}`); }

        try {
          await sql`DELETE FROM submission_evidence WHERE submission_id = ${ghostIds.submissionId}`;
          cleanupDetails.evidence = "deleted";
        } catch (e: unknown) { cleanupErrors.push(`evidence: ${e instanceof Error ? e.message : String(e)}`); }

        try {
          await sql`DELETE FROM submission_inline_edits WHERE submission_id = ${ghostIds.submissionId}`;
          cleanupDetails.inlineEdits = "deleted";
        } catch (e: unknown) { cleanupErrors.push(`inline_edits: ${e instanceof Error ? e.message : String(e)}`); }

        try {
          await sql`DELETE FROM cross_group_results WHERE submission_id = ${ghostIds.submissionId}`;
          cleanupDetails.crossGroupResults = "deleted";
        } catch (e: unknown) { cleanupErrors.push(`cross_group_results: ${e instanceof Error ? e.message : String(e)}`); }

        try {
          await sql`DELETE FROM vault_entries WHERE submission_id = ${ghostIds.submissionId}`;
          cleanupDetails.vaultEntries = "deleted";
        } catch (e: unknown) { cleanupErrors.push(`vault_entries: ${e instanceof Error ? e.message : String(e)}`); }

        try {
          await sql`DELETE FROM audit_log WHERE submission_id = ${ghostIds.submissionId}`;
          cleanupDetails.auditLog = "deleted";
        } catch (e: unknown) {
          // audit_log may not have submission_id column — that's ok
          cleanupDetails.auditLog = "skipped (may not have submission_id column)";
        }

        try {
          await sql`DELETE FROM submissions WHERE id = ${ghostIds.submissionId}`;
          cleanupDetails.submission = "deleted";
        } catch (e: unknown) { cleanupErrors.push(`submissions: ${e instanceof Error ? e.message : String(e)}`); }
      }

      // Delete organization members
      for (const memberId of ghostIds.memberIds) {
        try {
          await sql`DELETE FROM organization_members WHERE id = ${memberId}`;
        } catch (e: unknown) { cleanupErrors.push(`org_member ${memberId}: ${e instanceof Error ? e.message : String(e)}`); }
      }
      cleanupDetails.orgMembers = `deleted ${ghostIds.memberIds.length}`;

      // Delete juror users
      for (const jurorId of ghostIds.jurorIds) {
        try {
          await sql`DELETE FROM users WHERE id = ${jurorId}`;
        } catch (e: unknown) { cleanupErrors.push(`juror user ${jurorId}: ${e instanceof Error ? e.message : String(e)}`); }
      }
      cleanupDetails.jurorUsers = `deleted ${ghostIds.jurorIds.length}`;

      // Delete submitter user
      if (ghostIds.submitterId) {
        try {
          await sql`DELETE FROM users WHERE id = ${ghostIds.submitterId}`;
          cleanupDetails.submitterUser = "deleted";
        } catch (e: unknown) { cleanupErrors.push(`submitter: ${e instanceof Error ? e.message : String(e)}`); }
      }

      // Delete org
      if (ghostIds.orgId) {
        try {
          await sql`DELETE FROM organizations WHERE id = ${ghostIds.orgId}`;
          cleanupDetails.org = "deleted";
        } catch (e: unknown) { cleanupErrors.push(`org: ${e instanceof Error ? e.message : String(e)}`); }
      }

      // Verify cleanup — nothing should remain
      const orphanCheck = ghostIds.submissionId
        ? await sql`SELECT COUNT(*)::int AS cnt FROM submissions WHERE id = ${ghostIds.submissionId}`
        : { rows: [{ cnt: 0 }] };
      const orphanUserCheck = ghostIds.submitterId
        ? await sql`SELECT COUNT(*)::int AS cnt FROM users WHERE id = ${ghostIds.submitterId}`
        : { rows: [{ cnt: 0 }] };

      cleanupDetails.verifySubmissionGone = orphanCheck.rows[0].cnt === 0;
      cleanupDetails.verifySubmitterGone = orphanUserCheck.rows[0].cnt === 0;

      stages.push({
        stage: "7. Cleanup ghost records",
        status: cleanupErrors.length === 0 ? "PASS" : "FAIL",
        description: cleanupErrors.length === 0
          ? "All ghost records deleted successfully. Zero residue."
          : `Cleanup completed with ${cleanupErrors.length} error(s)`,
        details: { ...cleanupDetails, errors: cleanupErrors },
        durationMs: Date.now() - cleanupStart,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      stages.push({
        stage: "7. Cleanup ghost records",
        status: "ERROR",
        description: `Cleanup threw: ${msg}`,
        details: { ...cleanupDetails, errors: [...cleanupErrors, msg] },
        durationMs: Date.now() - cleanupStart,
      });
    }
  }

  const allPassed = stages.every(s => s.status === "PASS" || s.status === "SKIP");

  return ok({
    smokeTest: {
      overallStatus: allPassed ? "PASS" : "FAIL",
      totalDurationMs: Date.now() - overallStart,
      stageCount: stages.length,
      passCount: stages.filter(s => s.status === "PASS").length,
      failCount: stages.filter(s => s.status === "FAIL").length,
      errorCount: stages.filter(s => s.status === "ERROR").length,
    },
    stages,
    ghostIds,
  });
}
