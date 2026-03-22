import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden, err } from "@/lib/api-utils";
import { tryResolveSubmission } from "@/lib/vote-resolution";
import { normalizeUrl } from "@/lib/normalize-url";

// POST /api/admin/repair-data
// Repairs historical data damage caused by broken sql`` transactions.
// Admin-only. Idempotent — safe to run multiple times.
//
// Fixes:
// 1. NULL primary_org_id for users with active memberships
// 2. Duplicate votes (same user voted multiple times on same submission+role)
// 3. Missing audit log entries for resolved submissions
// 4. Missing user_review_history for resolved submissions
// 5. Missing user_ratings for votes with newsworthy/interesting data
// 6. Missing "Vote cast" audit log entries
// 7. Unresolved inline edits on approved submissions
// 8. Approved applications where user wasn't added to org
// 9. pending_di_review enum value (ALTER TYPE)
// 10. DI partnerships (multi-DI aware — fixes unlinked DIs via di_requests)
// 11. DI submissions missing di_partner_id
// 12. Missing "Submission filed" audit log entries
// 13. Missing evidence rows (backfilled with placeholder)
// 14. di_pending submissions missing di_partner_id
// 15. di_pending submissions with is_di=FALSE
// 16. NULL normalized_url on submissions (invisible to corrections API)

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  const report: string[] = [];
  let totalRepaired = 0;

  try {
    // ── 1. Fix NULL primary_org_id ──
    report.push("--- Fix NULL primary_org_id ---");
    const nullPrimary = await sql`
      UPDATE users SET primary_org_id = sub.org_id
      FROM (
        SELECT DISTINCT ON (user_id) user_id, org_id
        FROM organization_members
        WHERE is_active = TRUE
        ORDER BY user_id, joined_at ASC
      ) sub
      WHERE users.id = sub.user_id
        AND users.primary_org_id IS NULL
      RETURNING users.id, users.username, sub.org_id
    `;
    for (const row of nullPrimary.rows) {
      report.push(`OK @${row.username}: primary_org_id → ${(row.org_id as string).slice(0, 8)}…`);
    }
    report.push(`Fixed ${nullPrimary.rows.length} user(s) with NULL primary_org_id`);
    totalRepaired += nullPrimary.rows.length;

    // ── 2. Deduplicate votes ──
    report.push("\n--- Deduplicate votes ---");
    // Keep the earliest vote per (submission_id, user_id, role), delete the rest.
    // Also handle (dispute_id, user_id, role) for dispute votes.
    const dupeSubmissionVotes = await sql`
      DELETE FROM jury_votes
      WHERE id IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (
            PARTITION BY submission_id, user_id, role
            ORDER BY voted_at ASC, id ASC
          ) AS rn
          FROM jury_votes
          WHERE submission_id IS NOT NULL
        ) ranked
        WHERE rn > 1
      )
      RETURNING id, submission_id, user_id
    `;
    report.push(`Removed ${dupeSubmissionVotes.rows.length} duplicate submission vote(s)`);
    totalRepaired += dupeSubmissionVotes.rows.length;

    const dupeDisputeVotes = await sql`
      DELETE FROM jury_votes
      WHERE id IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (
            PARTITION BY dispute_id, user_id, role
            ORDER BY voted_at ASC, id ASC
          ) AS rn
          FROM jury_votes
          WHERE dispute_id IS NOT NULL
        ) ranked
        WHERE rn > 1
      )
      RETURNING id, dispute_id, user_id
    `;
    report.push(`Removed ${dupeDisputeVotes.rows.length} duplicate dispute vote(s)`);
    totalRepaired += dupeDisputeVotes.rows.length;

    // ── 3. Backfill missing "Submission resolved" audit log entries ──
    report.push("\n--- Backfill missing resolution audit logs ---");
    const resolvedNoAudit = await sql`
      SELECT s.id, s.status, s.submitted_by, s.org_id, s.resolved_at,
             s.deliberate_lie_finding, u.username
      FROM submissions s
      JOIN users u ON u.id = s.submitted_by
      WHERE s.status IN ('approved', 'rejected', 'consensus')
        AND s.resolved_at IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM audit_log a
          WHERE a.entity_type = 'submission'
            AND a.entity_id = s.id
            AND a.action LIKE 'Submission resolved:%'
        )
    `;
    for (const sub of resolvedNoAudit.rows) {
      await sql`
        INSERT INTO audit_log (action, user_id, org_id, entity_type, entity_id, metadata, created_at)
        VALUES (
          ${`Submission resolved: ${sub.status} (backfilled by repair script)`},
          ${sub.submitted_by},
          ${sub.org_id},
          'submission',
          ${sub.id},
          ${JSON.stringify({
            outcome: sub.status,
            deliberateLie: sub.deliberate_lie_finding || false,
            repairedAt: new Date().toISOString(),
            note: "Backfilled — original audit entry was lost due to broken sql`` transactions",
          })},
          ${sub.resolved_at}
        )
      `;
      totalRepaired++;
    }
    report.push(`Backfilled ${resolvedNoAudit.rows.length} missing resolution audit log(s)`);

    // ── 4. Backfill missing user_review_history ──
    report.push("\n--- Backfill missing user_review_history ---");
    const missingHistory = await sql`
      SELECT s.id AS submission_id, s.submitted_by, s.org_id, s.status,
             s.resolved_at, s.is_di, s.di_partner_id
      FROM submissions s
      WHERE s.status IN ('approved', 'rejected', 'consensus')
        AND s.resolved_at IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM user_review_history h
          WHERE h.submission_id = s.id
            AND h.user_id = s.submitted_by
        )
    `;
    for (const sub of missingHistory.rows) {
      const targetUserId = (sub.is_di && sub.di_partner_id) ? sub.di_partner_id : sub.submitted_by;
      const fromDi = !!(sub.is_di && sub.di_partner_id);
      await sql`
        INSERT INTO user_review_history (user_id, submission_id, outcome, from_di, created_at)
        VALUES (${targetUserId}, ${sub.submission_id}, ${sub.status}, ${fromDi}, ${sub.resolved_at})
        ON CONFLICT DO NOTHING
      `;
      totalRepaired++;
    }
    report.push(`Backfilled ${missingHistory.rows.length} missing user_review_history row(s)`);

    // ── 5. Backfill missing user_ratings ──
    report.push("\n--- Backfill missing user_ratings ---");
    const votesWithRatings = await sql`
      SELECT v.id AS vote_id, v.submission_id, v.user_id AS voter_id,
             v.newsworthy, v.interesting,
             s.submitted_by, s.is_di, s.di_partner_id
      FROM jury_votes v
      JOIN submissions s ON s.id = v.submission_id
      WHERE s.status IN ('approved', 'rejected', 'consensus')
        AND (v.newsworthy IS NOT NULL OR v.interesting IS NOT NULL)
        AND NOT EXISTS (
          SELECT 1 FROM user_ratings r
          WHERE r.submission_id = v.submission_id
            AND r.rated_by = v.user_id
        )
    `;
    let ratingsBackfilled = 0;
    for (const v of votesWithRatings.rows) {
      const targetUserId = (v.is_di && v.di_partner_id) ? v.di_partner_id : v.submitted_by;
      await sql`
        INSERT INTO user_ratings (user_id, submission_id, rated_by, newsworthy, interesting)
        VALUES (${targetUserId}, ${v.submission_id}, ${v.voter_id},
                ${v.newsworthy || 0}, ${v.interesting || 0})
        ON CONFLICT DO NOTHING
      `;
      ratingsBackfilled++;
    }
    report.push(`Backfilled ${ratingsBackfilled} missing user_ratings row(s)`);
    totalRepaired += ratingsBackfilled;

    // ── 6. Backfill missing "Vote cast" audit entries ──
    report.push("\n--- Backfill missing Vote cast audit logs ---");
    const votesNoAudit = await sql`
      SELECT v.id, v.submission_id, v.user_id, v.role, v.approve, v.voted_at,
             s.org_id
      FROM jury_votes v
      JOIN submissions s ON s.id = v.submission_id
      WHERE NOT EXISTS (
        SELECT 1 FROM audit_log a
        WHERE a.entity_type = 'submission'
          AND a.entity_id = v.submission_id
          AND a.user_id = v.user_id
          AND a.action LIKE 'Vote cast%'
      )
    `;
    // Batch: only insert one audit per (submission_id, user_id) to avoid bloat from dupes
    const seenVoteAudits = new Set<string>();
    let voteAuditsAdded = 0;
    for (const v of votesNoAudit.rows) {
      const key = `${v.submission_id}:${v.user_id}`;
      if (seenVoteAudits.has(key)) continue;
      seenVoteAudits.add(key);
      await sql`
        INSERT INTO audit_log (action, user_id, org_id, entity_type, entity_id, metadata, created_at)
        VALUES (
          'Vote cast (backfilled)',
          ${v.user_id}, ${v.org_id}, 'submission', ${v.submission_id},
          ${JSON.stringify({ role: v.role, approve: v.approve, repairedAt: new Date().toISOString() })},
          ${v.voted_at}
        )
      `;
      voteAuditsAdded++;
    }
    report.push(`Backfilled ${voteAuditsAdded} missing Vote cast audit log(s)`);
    totalRepaired += voteAuditsAdded;

    // ── 7. Fix unresolved inline edits on approved submissions ──
    report.push("\n--- Fix unresolved inline edits ---");
    const stuckEdits = await sql`
      UPDATE submission_inline_edits
      SET approved = TRUE
      WHERE submission_id IN (
        SELECT id FROM submissions WHERE status IN ('approved', 'consensus')
      )
      AND approved IS NULL
      RETURNING id, submission_id
    `;
    report.push(`Fixed ${stuckEdits.rows.length} inline edit(s) with NULL approved on approved submissions`);
    totalRepaired += stuckEdits.rows.length;

    // ── 8. Fix approved applications where user wasn't added to org ──
    report.push("\n--- Fix approved applications missing org membership ---");
    const approvedNotMember = await sql`
      SELECT ma.id AS app_id, ma.user_id, ma.org_id, u.username, o.name AS org_name
      FROM membership_applications ma
      JOIN users u ON u.id = ma.user_id
      JOIN organizations o ON o.id = ma.org_id
      WHERE ma.status = 'approved'
        AND NOT EXISTS (
          SELECT 1 FROM organization_members om
          WHERE om.user_id = ma.user_id
            AND om.org_id = ma.org_id
            AND om.is_active = TRUE
        )
    `;
    for (const app of approvedNotMember.rows) {
      const client = await sql.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO organization_members (org_id, user_id, is_active)
           VALUES ($1, $2, TRUE)
           ON CONFLICT (org_id, user_id)
           DO UPDATE SET is_active = TRUE, left_at = NULL`,
          [app.org_id, app.user_id]
        );
        await client.query(
          `INSERT INTO organization_member_history (org_id, user_id, action)
           VALUES ($1, $2, 'joined')`,
          [app.org_id, app.user_id]
        );
        await client.query("COMMIT");
        report.push(`OK @${app.username}: added to ${app.org_name} (approved application was missing membership)`);
        totalRepaired++;
      } catch (e) {
        await client.query("ROLLBACK");
        report.push(`ERR @${app.username} → ${app.org_name}: ${(e as Error).message}`);
      } finally {
        client.release();
      }
    }
    report.push(`Fixed ${approvedNotMember.rows.length} approved application(s) missing org membership`);

    // ── 9. Add pending_di_review enum value if missing ──
    report.push("\n--- Check submission_status enum ---");
    try {
      const enumCheck = await sql`
        SELECT EXISTS (
          SELECT 1 FROM pg_enum e
          JOIN pg_type t ON e.enumtypid = t.oid
          WHERE t.typname = 'submission_status'
            AND e.enumlabel = 'pending_di_review'
        ) AS has_value
      `;
      if (!enumCheck.rows[0].has_value) {
        await sql`ALTER TYPE submission_status ADD VALUE IF NOT EXISTS 'pending_di_review'`;
        report.push("Added 'pending_di_review' to submission_status enum");
        totalRepaired++;
      } else {
        report.push("SKIP: 'pending_di_review' already exists in submission_status enum");
      }
    } catch (e) {
      report.push(`WARN: Could not alter enum — ${(e as Error).message}. May need to run manually.`);
    }

    // ── 10. Fix DI partnerships via di_requests (multi-DI aware) ──
    report.push("\n--- Fix DI partnerships ---");
    // Fix approved di_requests where the DI user isn't properly linked
    const unlinkedDIs = await sql`
      SELECT dr.id AS req_id, dr.di_user_id, dr.partner_user_id,
             u1.username AS di_username, u1.is_di, u1.di_partner_id, u1.di_approved,
             u2.username AS partner_username, u2.di_partner_id AS partner_di_partner_id
      FROM di_requests dr
      JOIN users u1 ON u1.id = dr.di_user_id
      JOIN users u2 ON u2.id = dr.partner_user_id
      WHERE dr.status = 'approved'
        AND (u1.di_partner_id != dr.partner_user_id
             OR u1.is_di != TRUE OR u1.di_approved != TRUE)
    `;
    for (const row of unlinkedDIs.rows) {
      await sql`
        UPDATE users SET is_di = TRUE, di_partner_id = ${row.partner_user_id}, di_approved = TRUE
        WHERE id = ${row.di_user_id}
      `;
      report.push(`OK @${row.di_username}: linked to @${row.partner_username} (was unlinked despite approved di_request)`);
      totalRepaired++;
    }
    // For human partners with NULL di_partner_id, set to their first approved DI
    const humansMissingDI = await sql`
      SELECT DISTINCT ON (dr.partner_user_id) dr.partner_user_id, dr.di_user_id,
             u2.username AS partner_username, u1.username AS di_username
      FROM di_requests dr
      JOIN users u1 ON u1.id = dr.di_user_id
      JOIN users u2 ON u2.id = dr.partner_user_id
      WHERE dr.status = 'approved'
        AND u2.di_partner_id IS NULL
      ORDER BY dr.partner_user_id, dr.created_at ASC
    `;
    for (const row of humansMissingDI.rows) {
      await sql`
        UPDATE users SET di_partner_id = ${row.di_user_id}
        WHERE id = ${row.partner_user_id} AND di_partner_id IS NULL
      `;
      report.push(`OK @${row.partner_username}: di_partner_id → @${row.di_username} (first approved DI)`);
      totalRepaired++;
    }
    if (unlinkedDIs.rows.length === 0 && humansMissingDI.rows.length === 0) {
      report.push("SKIP: All DI partnerships are properly linked");
    }

    // ── 11. Fix DI submissions missing di_partner_id ──
    report.push("\n--- Fix DI submissions missing di_partner_id ---");
    const diSubsNoPartner = await sql`
      UPDATE submissions s
      SET di_partner_id = u.di_partner_id
      FROM users u
      WHERE s.submitted_by = u.id
        AND s.is_di = TRUE
        AND s.di_partner_id IS NULL
        AND u.di_partner_id IS NOT NULL
      RETURNING s.id, u.username, u.di_partner_id
    `;
    for (const row of diSubsNoPartner.rows) {
      report.push(`OK submission ${(row.id as string).slice(0, 8)}… by @${row.username}: set di_partner_id`);
    }
    report.push(`Fixed ${diSubsNoPartner.rows.length} DI submission(s) missing di_partner_id`);
    totalRepaired += diSubsNoPartner.rows.length;

    // ── 12. Backfill missing "Submission filed" audit entries ──
    report.push("\n--- Backfill missing Submission filed audit logs ---");
    const subsNoCreateAudit = await sql`
      SELECT s.id, s.submitted_by, s.org_id, s.created_at, u.username
      FROM submissions s
      JOIN users u ON u.id = s.submitted_by
      WHERE NOT EXISTS (
        SELECT 1 FROM audit_log al
        WHERE al.entity_type = 'submission' AND al.entity_id = s.id
          AND (al.action LIKE 'Submission created%' OR al.action LIKE 'New submission%'
               OR al.action = 'Submitted correction' OR al.action LIKE 'Submission filed%')
      )
    `;
    for (const sub of subsNoCreateAudit.rows) {
      await sql`
        INSERT INTO audit_log (action, user_id, org_id, entity_type, entity_id, metadata, created_at)
        VALUES (
          'Submission filed (backfilled)',
          ${sub.submitted_by}, ${sub.org_id}, 'submission', ${sub.id},
          ${JSON.stringify({ repairedAt: new Date().toISOString(), note: "Backfilled — original audit entry was lost due to broken sql`` transactions" })},
          ${sub.created_at}
        )
      `;
    }
    report.push(`Backfilled ${subsNoCreateAudit.rows.length} missing Submission filed audit log(s)`);
    totalRepaired += subsNoCreateAudit.rows.length;

    // ── 13. Backfill missing evidence rows with placeholder ──
    report.push("\n--- Backfill missing evidence rows ---");
    const subsNoEvidence = await sql`
      SELECT s.id, s.submitted_by, s.url, u.username
      FROM submissions s
      JOIN users u ON u.id = s.submitted_by
      WHERE NOT EXISTS (
        SELECT 1 FROM submission_evidence se WHERE se.submission_id = s.id
      )
    `;
    for (const sub of subsNoEvidence.rows) {
      await sql`
        INSERT INTO submission_evidence (submission_id, url, explanation, sort_order)
        VALUES (
          ${sub.id},
          ${sub.url || 'https://repair-placeholder'},
          ${'(backfilled) Original evidence was lost due to broken sql`` transactions'},
          0
        )
      `;
    }
    report.push(`Backfilled ${subsNoEvidence.rows.length} submission(s) missing evidence rows`);
    totalRepaired += subsNoEvidence.rows.length;

    // ── 14. Fix di_pending submissions with NULL di_partner_id ──
    report.push("\n--- Fix di_pending submissions missing di_partner_id ---");
    const diPendingNoPartner = await sql`
      UPDATE submissions s
      SET di_partner_id = u.di_partner_id
      FROM users u
      WHERE s.submitted_by = u.id
        AND s.status = 'di_pending'
        AND s.di_partner_id IS NULL
        AND u.di_partner_id IS NOT NULL
      RETURNING s.id, u.username, u.di_partner_id
    `;
    for (const row of diPendingNoPartner.rows) {
      report.push(`OK submission ${(row.id as string).slice(0, 8)}… by @${row.username}: set di_partner_id on di_pending submission`);
    }
    report.push(`Fixed ${diPendingNoPartner.rows.length} di_pending submission(s) missing di_partner_id`);
    totalRepaired += diPendingNoPartner.rows.length;

    // ── 15. Fix di_pending submissions with is_di=FALSE ──
    // First, handle inverted DI submissions: if a non-DI user (human partner)
    // created a di_pending submission, convert it to pending_jury since it
    // should go through normal review flow, not DI pre-approval.
    report.push("\n--- Fix inverted DI submissions (human-submitted di_pending) ---");
    const invertedDiSubs = await sql`
      UPDATE submissions s
      SET status = 'pending_jury', is_di = FALSE
      FROM users u
      WHERE s.submitted_by = u.id
        AND s.status = 'di_pending'
        AND u.is_di = FALSE
      RETURNING s.id, u.username
    `;
    for (const row of invertedDiSubs.rows) {
      report.push(`OK submission ${(row.id as string).slice(0, 8)}… by @${row.username}: converted inverted di_pending → pending_jury (submitter is human, not DI)`);
    }
    report.push(`Fixed ${invertedDiSubs.rows.length} inverted DI submission(s)`);
    totalRepaired += invertedDiSubs.rows.length;

    // Then, for remaining di_pending with is_di=FALSE on the submission (but
    // submitter IS a DI), fix the submission flag.
    report.push("\n--- Fix di_pending submissions with is_di=FALSE ---");
    const diPendingNotMarked = await sql`
      UPDATE submissions
      SET is_di = TRUE
      WHERE status = 'di_pending'
        AND is_di = FALSE
      RETURNING id
    `;
    report.push(`Fixed ${diPendingNotMarked.rows.length} di_pending submission(s) with is_di=FALSE`);
    totalRepaired += diPendingNotMarked.rows.length;

    // ── 16. Backfill NULL normalized_url on submissions ──
    report.push("\n--- Backfill NULL normalized_url ---");
    const nullUrlSubs = await sql`
      SELECT id, url FROM submissions
      WHERE normalized_url IS NULL AND url IS NOT NULL
    `;
    let urlsFixed = 0;
    for (const sub of nullUrlSubs.rows) {
      const normalized = normalizeUrl(sub.url as string);
      await sql`
        UPDATE submissions SET normalized_url = ${normalized} WHERE id = ${sub.id}
      `;
      urlsFixed++;
    }
    report.push(`Backfilled ${urlsFixed} submission(s) with NULL normalized_url`);
    totalRepaired += urlsFixed;

    // ── 17. Delete DI accounts from jury assignments ──
    report.push("\n--- Remove DI accounts from jury assignments ---");
    const diJuryDeleted = await sql`
      DELETE FROM jury_assignments
      WHERE user_id IN (SELECT id FROM users WHERE is_di = TRUE)
      RETURNING id, submission_id, user_id
    `;
    report.push(`Deleted ${diJuryDeleted.rows.length} jury assignment(s) where juror is a DI account`);
    totalRepaired += diJuryDeleted.rows.length;

    // ── 18. Delete orphaned DI rejections (status='rejected' with is_di=TRUE) ──
    // These are leftover from old code that set status='rejected' instead of deleting.
    report.push("\n--- Clean up orphaned DI rejections ---");
    const orphanedDiRejections = await sql`
      SELECT s.id FROM submissions s
      WHERE s.status = 'rejected'
        AND s.is_di = TRUE
        AND NOT EXISTS (
          SELECT 1 FROM jury_votes jv WHERE jv.submission_id = s.id
        )
    `;
    for (const sub of orphanedDiRejections.rows) {
      const client = await sql.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM submission_evidence WHERE submission_id = $1", [sub.id]);
        await client.query("DELETE FROM submission_inline_edits WHERE submission_id = $1", [sub.id]);
        await client.query("DELETE FROM jury_assignments WHERE submission_id = $1", [sub.id]);
        await client.query("DELETE FROM jury_votes WHERE submission_id = $1", [sub.id]);
        await client.query("DELETE FROM submission_linked_entries WHERE submission_id = $1", [sub.id]);
        await client.query("DELETE FROM submissions WHERE id = $1", [sub.id]);
        await client.query(
          "INSERT INTO audit_log (action, entity_type, metadata) VALUES ($1, $2, $3)",
          [
            "Orphaned DI rejection cleaned up (repair script)",
            "di_rejection",
            JSON.stringify({ deletedSubmissionId: sub.id, repairedAt: new Date().toISOString() }),
          ]
        );
        await client.query("COMMIT");
        report.push(`OK: Deleted orphaned DI rejection ${(sub.id as string).slice(0, 8)}…`);
        totalRepaired++;
      } catch (e) {
        await client.query("ROLLBACK");
        report.push(`ERR: Failed to clean up DI rejection ${(sub.id as string).slice(0, 8)}…: ${(e as Error).message}`);
      } finally {
        client.release();
      }
    }
    report.push(`Cleaned up ${orphanedDiRejections.rows.length} orphaned DI rejection(s)`);

    // ── 19. Fix user reputation drift ──
    // Recompute total_wins, total_losses, deliberate_lies from actual submission outcomes
    report.push("\n--- Fix user reputation drift ---");
    const allSubmitters = await sql`
      SELECT DISTINCT s.submitted_by AS user_id, u.username,
             u.is_di, u.di_partner_id
      FROM submissions s
      JOIN users u ON u.id = s.submitted_by
      WHERE s.status IN ('approved', 'consensus', 'rejected', 'consensus_rejected')
    `;
    let reputationFixed = 0;
    for (const row of allSubmitters.rows) {
      // For DI submissions, reputation goes to the human partner
      const targetUserId = row.is_di && row.di_partner_id ? row.di_partner_id : row.user_id;

      // Count wins (approved/consensus) for submissions by this user
      const winsResult = await sql`
        SELECT COUNT(*)::int AS cnt FROM submissions
        WHERE submitted_by = ${row.user_id}
          AND status IN ('approved', 'consensus')
      `;
      // Count losses (rejected/consensus_rejected) for submissions by this user
      const lossesResult = await sql`
        SELECT COUNT(*)::int AS cnt FROM submissions
        WHERE submitted_by = ${row.user_id}
          AND status IN ('rejected', 'consensus_rejected')
      `;
      // Count deliberate lies
      const dlResult = await sql`
        SELECT COUNT(*)::int AS cnt FROM submissions
        WHERE submitted_by = ${row.user_id}
          AND deliberate_lie_finding = TRUE
          AND status IN ('approved', 'consensus', 'rejected', 'consensus_rejected')
      `;

      const expectedWins = winsResult.rows[0].cnt;
      const expectedLosses = lossesResult.rows[0].cnt;
      const expectedDL = dlResult.rows[0].cnt;

      // Check current stats for the target user
      const currentStats = await sql`
        SELECT total_wins, total_losses, deliberate_lies FROM users WHERE id = ${targetUserId}
      `;
      if (currentStats.rows.length === 0) continue;
      const current = currentStats.rows[0];

      // If this is a DI, we need to aggregate across all DI submissions attributed to this partner
      // For non-DI, it's straightforward
      if (!row.is_di) {
        // Also count wins/losses from DI submissions attributed to this user via di_partner_id
        const diWins = await sql`
          SELECT COUNT(*)::int AS cnt FROM submissions
          WHERE di_partner_id = ${targetUserId}
            AND is_di = TRUE
            AND status IN ('approved', 'consensus')
        `;
        const diLosses = await sql`
          SELECT COUNT(*)::int AS cnt FROM submissions
          WHERE di_partner_id = ${targetUserId}
            AND is_di = TRUE
            AND status IN ('rejected', 'consensus_rejected')
        `;
        const diDL = await sql`
          SELECT COUNT(*)::int AS cnt FROM submissions
          WHERE di_partner_id = ${targetUserId}
            AND is_di = TRUE
            AND deliberate_lie_finding = TRUE
            AND status IN ('approved', 'consensus', 'rejected', 'consensus_rejected')
        `;

        const totalWins = expectedWins + diWins.rows[0].cnt;
        const totalLosses = expectedLosses + diLosses.rows[0].cnt;
        const totalDL = expectedDL + diDL.rows[0].cnt;

        if (current.total_wins !== totalWins || current.total_losses !== totalLosses || current.deliberate_lies !== totalDL) {
          await sql`
            UPDATE users SET total_wins = ${totalWins}, total_losses = ${totalLosses}, deliberate_lies = ${totalDL}
            WHERE id = ${targetUserId}
          `;
          report.push(`OK @${row.username}: reputation ${current.total_wins}W/${current.total_losses}L/${current.deliberate_lies}DL → ${totalWins}W/${totalLosses}L/${totalDL}DL`);
          reputationFixed++;
        }
      }
    }
    report.push(`Fixed ${reputationFixed} user(s) with reputation drift`);
    totalRepaired += reputationFixed;

    // ── 20. Fix membership inconsistency (users with primary_org but no active membership) ──
    report.push("\n--- Fix membership inconsistencies ---");
    const noMembership = await sql`
      SELECT u.id, u.username, u.primary_org_id, o.name AS org_name
      FROM users u
      JOIN organizations o ON o.id = u.primary_org_id
      WHERE u.primary_org_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM organization_members om
          WHERE om.user_id = u.id AND om.org_id = u.primary_org_id AND om.is_active = TRUE
        )
    `;
    for (const row of noMembership.rows) {
      const client = await sql.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO organization_members (org_id, user_id, is_active)
           VALUES ($1, $2, TRUE)
           ON CONFLICT (org_id, user_id)
           DO UPDATE SET is_active = TRUE, left_at = NULL`,
          [row.primary_org_id, row.id]
        );
        await client.query(
          `INSERT INTO organization_member_history (org_id, user_id, action)
           VALUES ($1, $2, 'joined')`,
          [row.primary_org_id, row.id]
        );
        await client.query("COMMIT");
        report.push(`OK @${row.username}: restored membership in ${row.org_name}`);
        totalRepaired++;
      } catch (e) {
        await client.query("ROLLBACK");
        report.push(`ERR @${row.username}: ${(e as Error).message}`);
      } finally {
        client.release();
      }
    }
    report.push(`Fixed ${noMembership.rows.length} user(s) with missing org membership`);

    // ── 21. Re-resolve stalled submissions ──
    // Submissions in pending_review/cross_review where all jurors have voted but resolution never triggered
    report.push("\n--- Re-resolve stalled submissions ---");
    const stalledSubs = await sql`
      SELECT s.id, s.status, s.jury_seats, s.cross_group_jury_size
      FROM submissions s
      WHERE s.status IN ('pending_review', 'cross_review')
    `;
    let stalledResolved = 0;
    for (const sub of stalledSubs.rows) {
      const isCross = sub.status === "cross_review";
      const expectedJurors = isCross ? (sub.cross_group_jury_size || 3) : (sub.jury_seats || 3);
      const role = isCross ? "cross_group" : "in_group";

      const voteCount = await sql`
        SELECT COUNT(*)::int AS cnt FROM jury_votes
        WHERE submission_id = ${sub.id} AND role = ${role}
      `;
      if (voteCount.rows[0].cnt >= expectedJurors) {
        try {
          const result = await tryResolveSubmission(sub.id as string, role);
          if (result.resolved) {
            report.push(`OK: Resolved stalled submission ${(sub.id as string).slice(0, 8)}… → ${result.outcome}`);
            stalledResolved++;
          }
        } catch (e) {
          report.push(`ERR: Failed to resolve ${(sub.id as string).slice(0, 8)}…: ${(e as Error).message}`);
        }
      }
    }
    report.push(`Re-resolved ${stalledResolved} stalled submission(s)`);
    totalRepaired += stalledResolved;

    // ── Audit the repair itself ──
    await sql`
      INSERT INTO audit_log (action, user_id, entity_type, metadata)
      VALUES (
        'Admin: data repair completed',
        ${admin.sub},
        'system',
        ${JSON.stringify({ totalRepaired, reportLines: report.length })}
      )
    `;

    return ok({
      success: true,
      totalRepaired,
      report,
    });
  } catch (e) {
    return err(`Data repair failed: ${(e as Error).message}`, 500);
  }
}
