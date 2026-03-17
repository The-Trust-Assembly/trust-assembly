-- ============================================================
-- 002: Backfill user reputation from KV store
-- ============================================================
-- Simple, tyrannical approach: read user data from kv_store,
-- extract reputation fields, and UPDATE the users table directly.
-- No fancy inference logic. Just copy the numbers.
--
-- Run this in Neon SQL Editor. Safe to run multiple times
-- (only updates where KV values are higher than current DB values).
-- ============================================================

-- Step 1: Preview what we'll update (run this first to sanity check)
-- ============================================================
/*
SELECT
  u.username,
  u.total_wins AS db_wins,
  (kv_user.value->>'totalWins')::int AS kv_wins,
  u.total_losses AS db_losses,
  (kv_user.value->>'totalLosses')::int AS kv_losses,
  u.current_streak AS db_streak,
  (kv_user.value->>'currentStreak')::int AS kv_streak,
  u.dispute_wins AS db_dw,
  (kv_user.value->>'disputeWins')::int AS kv_dw,
  u.dispute_losses AS db_dl,
  (kv_user.value->>'disputeLosses')::int AS kv_dl,
  u.deliberate_lies AS db_lies,
  (kv_user.value->>'deliberateLies')::int AS kv_lies
FROM kv_store kv
CROSS JOIN LATERAL jsonb_each(kv.value::jsonb) AS kv_user(username, value)
JOIN users u ON u.username = LOWER(kv_user.username)
WHERE kv.key LIKE 'ta-u-%'
ORDER BY u.username;
*/

-- Step 2: Apply the updates
-- ============================================================
UPDATE users u SET
  total_wins     = GREATEST(u.total_wins,     COALESCE((kv_user.value->>'totalWins')::int, 0)),
  total_losses   = GREATEST(u.total_losses,   COALESCE((kv_user.value->>'totalLosses')::int, 0)),
  current_streak = GREATEST(u.current_streak, COALESCE((kv_user.value->>'currentStreak')::int, 0)),
  dispute_wins   = GREATEST(u.dispute_wins,   COALESCE((kv_user.value->>'disputeWins')::int, 0)),
  dispute_losses = GREATEST(u.dispute_losses, COALESCE((kv_user.value->>'disputeLosses')::int, 0)),
  deliberate_lies = GREATEST(u.deliberate_lies, COALESCE((kv_user.value->>'deliberateLies')::int, 0))
FROM kv_store kv
CROSS JOIN LATERAL jsonb_each(kv.value::jsonb) AS kv_user(username, value)
WHERE kv.key LIKE 'ta-u-%'
  AND u.username = LOWER(kv_user.username);


-- Step 3: Cross-check — recompute wins/losses from actual resolved submissions
-- ============================================================
-- This recounts from the submissions table itself, as the source of truth.
-- If KV data was stale or wrong, this corrects it.

-- 3a: Recompute total_wins from approved submissions
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
  AND u.total_wins != sub_counts.wins;

-- 3b: Recompute total_losses from rejected submissions
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
  AND u.total_losses != sub_counts.losses;

-- 3c: Recompute deliberate_lies
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
  AND u.deliberate_lies != sub_counts.lies;

-- 3d: Recompute dispute_wins (dispute upheld = original submitter was wrong = disputer wins)
UPDATE users u SET dispute_wins = disp_counts.wins
FROM (
  SELECT d.disputed_by AS user_id, COUNT(*) AS wins
  FROM disputes d
  WHERE d.status = 'upheld'
  GROUP BY d.disputed_by
) disp_counts
WHERE u.id = disp_counts.user_id
  AND u.dispute_wins != disp_counts.wins;

-- 3e: Recompute dispute_losses (dispute dismissed = disputer was wrong)
UPDATE users u SET dispute_losses = disp_counts.losses
FROM (
  SELECT d.disputed_by AS user_id, COUNT(*) AS losses
  FROM disputes d
  WHERE d.status = 'dismissed'
  GROUP BY d.disputed_by
) disp_counts
WHERE u.id = disp_counts.user_id
  AND u.dispute_losses != disp_counts.losses;

-- 3f: Recompute current_streak (consecutive recent wins without a loss)
-- This is trickier — we need to count backwards from the most recent submission
WITH ordered_outcomes AS (
  SELECT
    CASE WHEN s.is_di AND s.di_partner_id IS NOT NULL THEN s.di_partner_id ELSE s.submitted_by END AS user_id,
    s.status,
    s.resolved_at,
    ROW_NUMBER() OVER (
      PARTITION BY CASE WHEN s.is_di AND s.di_partner_id IS NOT NULL THEN s.di_partner_id ELSE s.submitted_by END
      ORDER BY s.resolved_at DESC
    ) AS rn
  FROM submissions s
  WHERE s.status IN ('approved', 'consensus', 'rejected', 'consensus_rejected')
    AND s.resolved_at IS NOT NULL
),
streaks AS (
  SELECT
    user_id,
    COUNT(*) FILTER (WHERE rn <= (
      SELECT COALESCE(MIN(o2.rn) - 1, MAX(o3.rn))
      FROM ordered_outcomes o2
      WHERE o2.user_id = ordered_outcomes.user_id
        AND o2.status IN ('rejected', 'consensus_rejected')
      -- if no losses, count all wins
    )) AS streak_placeholder
  FROM ordered_outcomes
  WHERE status IN ('approved', 'consensus')
  GROUP BY user_id
)
-- Actually, simpler approach: just count consecutive wins from the top
UPDATE users u SET current_streak = streak_calc.streak
FROM (
  SELECT user_id, COUNT(*) AS streak
  FROM (
    SELECT
      user_id,
      status,
      rn,
      -- Find the first loss position per user
      MIN(CASE WHEN status IN ('rejected', 'consensus_rejected') THEN rn END) OVER (PARTITION BY user_id) AS first_loss_rn
    FROM ordered_outcomes
  ) sub
  WHERE status IN ('approved', 'consensus')
    AND (first_loss_rn IS NULL OR rn < first_loss_rn)
  GROUP BY user_id
) streak_calc
WHERE u.id = streak_calc.user_id
  AND u.current_streak != streak_calc.streak;


-- Step 4: Verify results
-- ============================================================
/*
SELECT username, total_wins, total_losses, current_streak,
       dispute_wins, dispute_losses, deliberate_lies
FROM users
ORDER BY total_wins DESC, username;
*/
