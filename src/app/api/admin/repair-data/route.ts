import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden, err } from "@/lib/api-utils";

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
      await sql`
        INSERT INTO user_review_history (user_id, submission_id, org_id, outcome, created_at)
        VALUES (${targetUserId}, ${sub.submission_id}, ${sub.org_id}, ${sub.status}, ${sub.resolved_at})
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
          `INSERT INTO organization_member_history (org_id, user_id, action, performed_by)
           VALUES ($1, $2, 'joined_via_repair', $3)`,
          [app.org_id, app.user_id, admin.sub]
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
