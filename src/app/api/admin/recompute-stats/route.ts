import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, forbidden, err } from "@/lib/api-utils";

// POST /api/admin/recompute-stats
// Recomputes total_wins, total_losses, current_streak, deliberate_lies,
// dispute_wins, dispute_losses from the actual submissions and disputes tables.
// This fixes any drift between the counters and the real data.
// Admin-only, safe to run multiple times.

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return forbidden("Admin access required");

  const report: string[] = [];

  // 1. Recompute total_wins from approved/consensus submissions
  const winsResult = await sql`
    UPDATE users u SET total_wins = sub_counts.wins
    FROM (
      SELECT
        CASE WHEN s.is_di AND s.di_partner_id IS NOT NULL THEN s.di_partner_id ELSE s.submitted_by END AS user_id,
        COUNT(*) AS wins
      FROM submissions s
      WHERE s.status IN ('approved', 'consensus')
      GROUP BY 1
    ) sub_counts
    WHERE u.id = sub_counts.user_id
      AND u.total_wins != sub_counts.wins
    RETURNING u.username, u.total_wins AS new_wins
  `;
  for (const row of winsResult.rows) {
    report.push(`Wins: @${row.username} → ${row.new_wins}`);
  }

  // 2. Recompute total_losses from rejected/consensus_rejected submissions
  const lossesResult = await sql`
    UPDATE users u SET total_losses = sub_counts.losses
    FROM (
      SELECT
        CASE WHEN s.is_di AND s.di_partner_id IS NOT NULL THEN s.di_partner_id ELSE s.submitted_by END AS user_id,
        COUNT(*) AS losses
      FROM submissions s
      WHERE s.status IN ('rejected', 'consensus_rejected')
      GROUP BY 1
    ) sub_counts
    WHERE u.id = sub_counts.user_id
      AND u.total_losses != sub_counts.losses
    RETURNING u.username, u.total_losses AS new_losses
  `;
  for (const row of lossesResult.rows) {
    report.push(`Losses: @${row.username} → ${row.new_losses}`);
  }

  // 3. Recompute deliberate_lies
  const liesResult = await sql`
    UPDATE users u SET deliberate_lies = sub_counts.lies
    FROM (
      SELECT
        CASE WHEN s.is_di AND s.di_partner_id IS NOT NULL THEN s.di_partner_id ELSE s.submitted_by END AS user_id,
        COUNT(*) AS lies
      FROM submissions s
      WHERE s.deliberate_lie_finding = TRUE
      GROUP BY 1
    ) sub_counts
    WHERE u.id = sub_counts.user_id
      AND u.deliberate_lies != sub_counts.lies
    RETURNING u.username, u.deliberate_lies AS new_lies
  `;
  for (const row of liesResult.rows) {
    report.push(`Lies: @${row.username} → ${row.new_lies}`);
  }

  // 4. Recompute dispute_wins (upheld disputes = disputer wins)
  const dwResult = await sql`
    UPDATE users u SET dispute_wins = disp_counts.wins
    FROM (
      SELECT d.disputed_by AS user_id, COUNT(*) AS wins
      FROM disputes d
      WHERE d.status = 'upheld'
      GROUP BY d.disputed_by
    ) disp_counts
    WHERE u.id = disp_counts.user_id
      AND u.dispute_wins != disp_counts.wins
    RETURNING u.username, u.dispute_wins AS new_dw
  `;
  for (const row of dwResult.rows) {
    report.push(`Dispute Wins: @${row.username} → ${row.new_dw}`);
  }

  // 5. Recompute dispute_losses (dismissed disputes = disputer loses)
  const dlResult = await sql`
    UPDATE users u SET dispute_losses = disp_counts.losses
    FROM (
      SELECT d.disputed_by AS user_id, COUNT(*) AS losses
      FROM disputes d
      WHERE d.status = 'dismissed'
      GROUP BY d.disputed_by
    ) disp_counts
    WHERE u.id = disp_counts.user_id
      AND u.dispute_losses != disp_counts.losses
    RETURNING u.username, u.dispute_losses AS new_dl
  `;
  for (const row of dlResult.rows) {
    report.push(`Dispute Losses: @${row.username} → ${row.new_dl}`);
  }

  // 6. Recompute current_streak (consecutive wins from most recent, no losses)
  const streakResult = await sql`
    WITH ordered_outcomes AS (
      SELECT
        CASE WHEN s.is_di AND s.di_partner_id IS NOT NULL THEN s.di_partner_id ELSE s.submitted_by END AS user_id,
        s.status,
        ROW_NUMBER() OVER (
          PARTITION BY CASE WHEN s.is_di AND s.di_partner_id IS NOT NULL THEN s.di_partner_id ELSE s.submitted_by END
          ORDER BY s.resolved_at DESC
        ) AS rn
      FROM submissions s
      WHERE s.status IN ('approved', 'consensus', 'rejected', 'consensus_rejected')
        AND s.resolved_at IS NOT NULL
    ),
    streak_calc AS (
      SELECT user_id, COUNT(*) AS streak
      FROM (
        SELECT
          user_id, status, rn,
          MIN(CASE WHEN status IN ('rejected', 'consensus_rejected') THEN rn END) OVER (PARTITION BY user_id) AS first_loss_rn
        FROM ordered_outcomes
      ) sub
      WHERE status IN ('approved', 'consensus')
        AND (first_loss_rn IS NULL OR rn < first_loss_rn)
      GROUP BY user_id
    )
    UPDATE users u SET current_streak = streak_calc.streak
    FROM streak_calc
    WHERE u.id = streak_calc.user_id
      AND u.current_streak != streak_calc.streak
    RETURNING u.username, u.current_streak AS new_streak
  `;
  for (const row of streakResult.rows) {
    report.push(`Streak: @${row.username} → ${row.new_streak}`);
  }

  if (report.length === 0) {
    report.push("All user stats already match the source data. No changes needed.");
  }

  await sql`
    INSERT INTO audit_log (action, user_id, entity_type, metadata)
    VALUES (
      'Admin recomputed user stats from submissions/disputes',
      ${admin.sub},
      'user',
      ${JSON.stringify({ changes: report.length, report })}
    )
  `;

  return ok({ success: true, changes: report.length, report });
}
