import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden, serverError } from "@/lib/api-utils";
import { tryResolveSubmission, tryResolveStory, tryResolveDispute } from "@/lib/vote-resolution";
import { createNotification } from "@/lib/notifications";
import { isWildWestMode, getJurySize, JURY_POOL_MULTIPLIER } from "@/lib/jury-rules";
import { getMajority } from "@/lib/jury-rules";
import { assignDisputeJury } from "@/lib/jury-assignment";
import { createNotification } from "@/lib/notifications";

// POST /api/admin/process-records
// Scans all in-flight records (submissions, stories, disputes, concessions)
// and advances any that have enough votes but were never resolved.
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  try {
    const results = {
      submissions: { scanned: 0, advanced: 0, details: [] as string[] },
      stories: { scanned: 0, advanced: 0, details: [] as string[] },
      disputeBackfills: { scanned: 0, backfilled: 0, details: [] as string[] },
      disputes: { scanned: 0, advanced: 0, details: [] as string[] },
      concessions: { scanned: 0, advanced: 0, details: [] as string[] },
    };

    // ── Submissions ──
    const stalledSubs = await sql`
      SELECT s.id, s.status, s.jury_seats, s.cross_group_jury_size,
        (SELECT COUNT(*) FROM jury_votes jv WHERE jv.submission_id = s.id
           AND jv.role = CASE WHEN s.status = 'cross_review' THEN 'cross_group'::jury_role ELSE 'in_group'::jury_role END
           AND jv.approve = TRUE)::int AS approve_count,
        (SELECT COUNT(*) FROM jury_votes jv WHERE jv.submission_id = s.id
           AND jv.role = CASE WHEN s.status = 'cross_review' THEN 'cross_group'::jury_role ELSE 'in_group'::jury_role END
           AND jv.approve = FALSE)::int AS reject_count,
        (SELECT COUNT(*) FROM jury_votes jv WHERE jv.submission_id = s.id
           AND jv.role = CASE WHEN s.status = 'cross_review' THEN 'cross_group'::jury_role ELSE 'in_group'::jury_role END)::int AS total_votes
      FROM submissions s
      WHERE s.status IN ('pending_review', 'cross_review')
    `;

    results.submissions.scanned = stalledSubs.rows.length;
    for (const sub of stalledSubs.rows) {
      const isCross = sub.status === "cross_review";
      const seats = isCross
        ? ((sub.cross_group_jury_size as number) || 3)
        : ((sub.jury_seats as number) || 3);
      const majority = getMajority(seats);
      const role = isCross ? "cross_group" : "in_group";

      if (
        (sub.approve_count as number) >= majority ||
        (sub.reject_count as number) >= majority ||
        (sub.total_votes as number) >= seats
      ) {
        try {
          const result = await tryResolveSubmission(sub.id as string, role);
          if (result.resolved) {
            results.submissions.advanced++;
            results.submissions.details.push(
              `${(sub.id as string).slice(0, 8)}… ${sub.status} → ${result.outcome} (${sub.approve_count}/${sub.reject_count} votes)`
            );
          }
        } catch {
          // Logged inside tryResolveSubmission
        }
      }
    }

    // ── Stories ──
    const stalledStories = await sql`
      SELECT st.id, st.title, st.status, st.jury_seats, st.cross_group_jury_size,
        (SELECT COUNT(*) FROM jury_votes jv WHERE jv.story_id = st.id
           AND jv.role = CASE WHEN st.status = 'cross_review' THEN 'cross_group'::jury_role ELSE 'in_group'::jury_role END
           AND jv.approve = TRUE)::int AS approve_count,
        (SELECT COUNT(*) FROM jury_votes jv WHERE jv.story_id = st.id
           AND jv.role = CASE WHEN st.status = 'cross_review' THEN 'cross_group'::jury_role ELSE 'in_group'::jury_role END
           AND jv.approve = FALSE)::int AS reject_count,
        (SELECT COUNT(*) FROM jury_votes jv WHERE jv.story_id = st.id
           AND jv.role = CASE WHEN st.status = 'cross_review' THEN 'cross_group'::jury_role ELSE 'in_group'::jury_role END)::int AS total_votes
      FROM stories st
      WHERE st.status IN ('pending_review', 'cross_review')
    `;

    results.stories.scanned = stalledStories.rows.length;
    for (const story of stalledStories.rows) {
      const isCross = story.status === "cross_review";
      const seats = isCross
        ? ((story.cross_group_jury_size as number) || 3)
        : ((story.jury_seats as number) || 3);
      const majority = getMajority(seats);
      const role = isCross ? "cross_group" : "in_group";

      if (
        (story.approve_count as number) >= majority ||
        (story.reject_count as number) >= majority ||
        (story.total_votes as number) >= seats
      ) {
        try {
          const result = await tryResolveStory(story.id as string, role);
          if (result.resolved) {
            results.stories.advanced++;
            results.stories.details.push(
              `${(story.id as string).slice(0, 8)}… "${story.title}" ${story.status} → ${result.outcome}`
            );
          }
        } catch {
          // Logged inside tryResolveStory
        }
      }
    }

    // ── Dispute Backfills: assign jurors to disputes that never got jury assignments ──
    const unassignedDisputes = await sql`
      SELECT d.id, d.submission_id, d.org_id, d.disputed_by, d.original_submitter
      FROM disputes d
      WHERE d.status = 'pending_review'
        AND NOT EXISTS (
          SELECT 1 FROM jury_assignments ja WHERE ja.dispute_id = d.id
        )
    `;

    results.disputeBackfills.scanned = unassignedDisputes.rows.length;
    for (const dispute of unassignedDisputes.rows) {
      try {
        const juryResult = await assignDisputeJury({
          disputeId: dispute.id as string,
          submissionId: dispute.submission_id as string,
          orgId: dispute.org_id as string,
          disputerId: dispute.disputed_by as string,
          originalSubmitterId: dispute.original_submitter as string,
        });

        if (juryResult.assigned > 0) {
          results.disputeBackfills.backfilled++;
          results.disputeBackfills.details.push(
            `${(dispute.id as string).slice(0, 8)}… assigned ${juryResult.assigned} jurors (jury size ${juryResult.jurySize})`
          );

          // Notify assigned jurors
          await Promise.allSettled(
            juryResult.jurorUserIds.map((userId) =>
              createNotification({
                userId,
                type: "dispute_jury_assigned",
                title: "You've been assigned to a dispute jury",
                body: "A disputed submission requires your review",
                entityType: "dispute",
                entityId: dispute.id as string,
              })
            )
          );
        } else {
          results.disputeBackfills.details.push(
            `${(dispute.id as string).slice(0, 8)}… no eligible jurors found`
          );
        }
      } catch (e) {
        console.error("Dispute jury backfill failed:", e);
        results.disputeBackfills.details.push(
          `${(dispute.id as string).slice(0, 8)}… ERROR: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }

    // ── Disputes ──
    const stalledDisputes = await sql`
      SELECT d.id, d.submission_id, d.status,
        (SELECT COUNT(*) FROM jury_votes jv WHERE jv.dispute_id = d.id AND jv.approve = TRUE)::int AS approve_count,
        (SELECT COUNT(*) FROM jury_votes jv WHERE jv.dispute_id = d.id AND jv.approve = FALSE)::int AS reject_count,
        (SELECT COUNT(*) FROM jury_votes jv WHERE jv.dispute_id = d.id)::int AS total_votes,
        (SELECT COUNT(*) FROM jury_assignments ja WHERE ja.dispute_id = d.id AND ja.accepted = TRUE)::int AS jury_size
      FROM disputes d
      WHERE d.status = 'pending_review'
    `;

    results.disputes.scanned = stalledDisputes.rows.length;
    for (const dispute of stalledDisputes.rows) {
      const jurySize = Math.max((dispute.jury_size as number) || 3, 3);
      const majority = getMajority(jurySize);

      if (
        (dispute.approve_count as number) >= majority ||
        (dispute.reject_count as number) >= majority ||
        (dispute.total_votes as number) >= jurySize
      ) {
        // Determine outcome
        const approved = (dispute.approve_count as number) >= (dispute.reject_count as number);
        const outcome = approved ? "upheld" : "dismissed";
        const now = new Date().toISOString();

        const client = await sql.connect();
        try {
          await client.query("BEGIN");
          await client.query(
            "UPDATE disputes SET status = $1, resolved_at = $2 WHERE id = $3",
            [outcome, now, dispute.id]
          );
          // Update parent submission
          if (approved) {
            await client.query(
              "UPDATE submissions SET status = 'upheld', resolved_at = $1 WHERE id = $2",
              [now, dispute.submission_id]
            );
          } else {
            await client.query(
              "UPDATE submissions SET status = 'dismissed', resolved_at = $1 WHERE id = $2",
              [now, dispute.submission_id]
            );
          }
          await client.query(
            `INSERT INTO audit_log (action, user_id, entity_type, entity_id, metadata)
             VALUES ($1, $2, 'dispute', $3, $4)`,
            [
              `Admin: process-records resolved dispute as ${outcome}`,
              admin.sub, dispute.id,
              JSON.stringify({ outcome, approveCount: dispute.approve_count, rejectCount: dispute.reject_count }),
            ]
          );
          await client.query("COMMIT");
          results.disputes.advanced++;
          results.disputes.details.push(
            `${(dispute.id as string).slice(0, 8)}… → ${outcome} (${dispute.approve_count}/${dispute.reject_count} votes)`
          );
        } catch (e) {
          await client.query("ROLLBACK");
          console.error("Process dispute failed:", e);
        } finally {
          client.release();
        }
      }
    }

    // ── Grace period expiration for disputes ──
    let graceExpired = 0;
    try {
      const expiredGrace = await sql`
        SELECT id, org_id, disputed_by, original_submitter
        FROM disputes
        WHERE status = 'grace_period' AND grace_period_until < now()
      `;
      for (const d of expiredGrace.rows) {
        await sql`UPDATE disputes SET status = 'pending_review', grace_period_until = NULL WHERE id = ${d.id}`;
        // Assign jury
        const wildWest = await isWildWestMode();
        const mc = await sql`SELECT COUNT(*) as count FROM organization_members WHERE org_id = ${d.org_id} AND is_active = TRUE`;
        const count = parseInt(mc.rows[0].count);
        const jurySize = wildWest ? 1 : getJurySize(count);
        const pool = await sql.query(
          `SELECT om.user_id FROM organization_members om JOIN users u ON u.id = om.user_id
           WHERE om.org_id = $1 AND om.is_active = TRUE AND u.is_di = FALSE
             AND om.user_id != $2 AND om.user_id != $3
           ORDER BY RANDOM() LIMIT $4`,
          [d.org_id, d.disputed_by, d.original_submitter, jurySize * JURY_POOL_MULTIPLIER]
        );
        for (const juror of pool.rows) {
          await sql.query(
            `INSERT INTO jury_assignments (dispute_id, user_id, role, in_pool, accepted, accepted_at)
             VALUES ($1, $2, 'dispute', TRUE, TRUE, now()) ON CONFLICT DO NOTHING`,
            [d.id, juror.user_id]
          );
          createNotification({ userId: juror.user_id as string, type: "dispute_jury_assigned", title: "You've been assigned to a dispute jury.", entityType: "dispute", entityId: d.id as string }).catch(() => {});
        }
        createNotification({ userId: d.original_submitter as string, type: "dispute_filed", title: "The 48-hour grace period has expired.", body: "The dispute will now proceed with the original filer.", entityType: "dispute", entityId: d.id as string }).catch(() => {});
        createNotification({ userId: d.disputed_by as string, type: "dispute_filed", title: "Your dispute is now proceeding to jury.", body: "The grace period expired without a takeover.", entityType: "dispute", entityId: d.id as string }).catch(() => {});
        graceExpired++;
      }
    } catch (e) { console.error("Grace period processing failed:", e); }

    // ── Concessions ──
    const stalledConcessions = await sql`
      SELECT c.id, c.submission_id, c.status,
        (SELECT COUNT(*) FROM jury_votes jv WHERE jv.concession_id = c.id AND jv.approve = TRUE)::int AS approve_count,
        (SELECT COUNT(*) FROM jury_votes jv WHERE jv.concession_id = c.id AND jv.approve = FALSE)::int AS reject_count,
        (SELECT COUNT(*) FROM jury_votes jv WHERE jv.concession_id = c.id)::int AS total_votes,
        (SELECT COUNT(*) FROM jury_assignments ja WHERE ja.concession_id = c.id AND ja.accepted = TRUE)::int AS jury_size
      FROM concessions c
      WHERE c.status = 'pending_review'
    `;

    results.concessions.scanned = stalledConcessions.rows.length;
    for (const conc of stalledConcessions.rows) {
      const jurySize = Math.max((conc.jury_size as number) || 3, 3);
      const majority = getMajority(jurySize);

      if (
        (conc.approve_count as number) >= majority ||
        (conc.reject_count as number) >= majority ||
        (conc.total_votes as number) >= jurySize
      ) {
        const approved = (conc.approve_count as number) >= (conc.reject_count as number);
        const outcome = approved ? "approved" : "rejected";
        const now = new Date().toISOString();

        const client = await sql.connect();
        try {
          await client.query("BEGIN");
          await client.query(
            "UPDATE concessions SET status = $1 WHERE id = $2",
            [outcome, conc.id]
          );
          await client.query(
            `INSERT INTO audit_log (action, user_id, entity_type, entity_id, metadata)
             VALUES ($1, $2, 'concession', $3, $4)`,
            [
              `Admin: process-records resolved concession as ${outcome}`,
              admin.sub, conc.id,
              JSON.stringify({ outcome, approveCount: conc.approve_count, rejectCount: conc.reject_count }),
            ]
          );
          await client.query("COMMIT");
          results.concessions.advanced++;
          results.concessions.details.push(
            `${(conc.id as string).slice(0, 8)}… → ${outcome} (${conc.approve_count}/${conc.reject_count} votes)`
          );
        } catch (e) {
          await client.query("ROLLBACK");
          console.error("Process concession failed:", e);
        } finally {
          client.release();
        }
      }
    }

    const totalAdvanced = results.submissions.advanced + results.stories.advanced + results.disputes.advanced + results.concessions.advanced;
    const totalScanned = results.submissions.scanned + results.stories.scanned + results.disputes.scanned + results.concessions.scanned;
    const totalBackfilled = results.disputeBackfills.backfilled;

    return ok({
      success: true,
      message: `Scanned ${totalScanned} in-flight records, advanced ${totalAdvanced}.${totalBackfilled > 0 ? ` Backfilled jury assignments for ${totalBackfilled} disputes.` : ""}`,
      totalScanned,
      totalAdvanced,
      totalBackfilled,
      results,
    });
  } catch (e) {
    return serverError("/api/admin/process-records", e);
  }
}
