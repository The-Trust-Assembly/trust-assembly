-- ============================================================
-- 003: Fix orphaned user_ratings and user_review_history
-- ============================================================
-- The vote-resolution.ts bug stored `submitted_by` (a user UUID)
-- in the `submission_id` column instead of the actual submission ID.
-- This script deletes the corrupted records and rebuilds them
-- from the actual jury_votes and submissions tables.
-- ============================================================

-- Step 1: Delete corrupted records
-- (submission_id contains a user UUID that won't match any submission)
-- ============================================================
DELETE FROM user_ratings
WHERE submission_id NOT IN (SELECT id FROM submissions);

DELETE FROM user_review_history
WHERE submission_id NOT IN (SELECT id FROM submissions);

-- Step 2: Rebuild user_ratings from jury_votes
-- ============================================================
INSERT INTO user_ratings (user_id, submission_id, rated_by, newsworthy, interesting, created_at)
SELECT
  CASE WHEN s.is_di AND s.di_partner_id IS NOT NULL THEN s.di_partner_id ELSE s.submitted_by END AS user_id,
  jv.submission_id,
  jv.user_id AS rated_by,
  jv.newsworthy,
  jv.interesting,
  jv.voted_at AS created_at
FROM jury_votes jv
JOIN submissions s ON s.id = jv.submission_id
WHERE jv.newsworthy IS NOT NULL
  AND jv.interesting IS NOT NULL
  AND jv.submission_id IS NOT NULL
  -- Don't duplicate existing records
  AND NOT EXISTS (
    SELECT 1 FROM user_ratings ur
    WHERE ur.submission_id = jv.submission_id
      AND ur.rated_by = jv.user_id
  );

-- Step 3: Rebuild user_review_history from resolved submissions
-- ============================================================
INSERT INTO user_review_history (user_id, submission_id, outcome, from_di, created_at)
SELECT
  CASE WHEN s.is_di AND s.di_partner_id IS NOT NULL THEN s.di_partner_id ELSE s.submitted_by END AS user_id,
  s.id AS submission_id,
  s.status AS outcome,
  s.is_di AS from_di,
  s.resolved_at AS created_at
FROM submissions s
WHERE s.status IN ('approved', 'consensus', 'rejected', 'consensus_rejected')
  AND s.resolved_at IS NOT NULL
  -- Don't duplicate existing records
  AND NOT EXISTS (
    SELECT 1 FROM user_review_history urh
    WHERE urh.submission_id = s.id
      AND urh.user_id = CASE WHEN s.is_di AND s.di_partner_id IS NOT NULL THEN s.di_partner_id ELSE s.submitted_by END
  );

-- Step 4: DI partnership fix (the simple version)
-- ============================================================
-- Set di_partner_id on both sides of known DI partnerships
UPDATE users SET
  di_partner_id = partner.submitted_by,
  is_di = FALSE
FROM (
  SELECT DISTINCT s.di_partner_id AS human_id, s.submitted_by
  FROM submissions s
  WHERE s.is_di = TRUE AND s.di_partner_id IS NOT NULL
) partner
WHERE users.id = partner.human_id
  AND users.di_partner_id IS NULL;

UPDATE users SET
  di_partner_id = partner.di_partner_id,
  is_di = TRUE,
  di_approved = TRUE
FROM (
  SELECT DISTINCT s.submitted_by AS di_id, s.di_partner_id
  FROM submissions s
  WHERE s.is_di = TRUE AND s.di_partner_id IS NOT NULL
) partner
WHERE users.id = partner.di_id
  AND users.di_partner_id IS NULL;

-- Step 5: Verify
-- ============================================================
/*
SELECT 'user_ratings' AS tbl, COUNT(*) FROM user_ratings
UNION ALL
SELECT 'user_review_history', COUNT(*) FROM user_review_history
UNION ALL
SELECT 'users_with_di_partner', COUNT(*) FROM users WHERE di_partner_id IS NOT NULL;
*/
