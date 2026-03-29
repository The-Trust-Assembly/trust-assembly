-- ============================================================
-- 008: Add composite indexes for frequently queried paths
-- ============================================================
-- These indexes target the hottest query patterns identified in
-- bulk data endpoints and the review queue.

-- jury_assignments: queried by (user_id + submission_id) in review queue
CREATE INDEX IF NOT EXISTS idx_jury_assignments_user_submission
  ON jury_assignments(user_id, submission_id)
  WHERE submission_id IS NOT NULL;

-- jury_assignments: queried by (user_id + dispute_id) in review queue
CREATE INDEX IF NOT EXISTS idx_jury_assignments_user_dispute
  ON jury_assignments(user_id, dispute_id)
  WHERE dispute_id IS NOT NULL;

-- jury_assignments: queried by (user_id + story_id) in review queue
CREATE INDEX IF NOT EXISTS idx_jury_assignments_user_story
  ON jury_assignments(user_id, story_id)
  WHERE story_id IS NOT NULL;

-- jury_assignments: queried by dispute_id for dispute jury lookups
CREATE INDEX IF NOT EXISTS idx_jury_assignments_dispute
  ON jury_assignments(dispute_id)
  WHERE dispute_id IS NOT NULL;

-- jury_votes: queried by (submission_id, user_id) for NOT EXISTS checks
CREATE INDEX IF NOT EXISTS idx_jury_votes_submission_user
  ON jury_votes(submission_id, user_id)
  WHERE submission_id IS NOT NULL;

-- jury_votes: queried by (dispute_id, user_id) for NOT EXISTS checks
CREATE INDEX IF NOT EXISTS idx_jury_votes_dispute_user
  ON jury_votes(dispute_id, user_id)
  WHERE dispute_id IS NOT NULL;

-- jury_votes: queried by (story_id, user_id) for NOT EXISTS checks
CREATE INDEX IF NOT EXISTS idx_jury_votes_story_user
  ON jury_votes(story_id, user_id)
  WHERE story_id IS NOT NULL;

-- submissions: queried by (status, org_id) in queue and admin endpoints
CREATE INDEX IF NOT EXISTS idx_submissions_status_org
  ON submissions(status, org_id);

-- disputes: queried by (status) for pending review lookups
CREATE INDEX IF NOT EXISTS idx_disputes_status
  ON disputes(status);

-- notifications: queried by (user_id, created_at DESC) for per-user pagination
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications(user_id, created_at DESC);

-- organization_members: queried by (org_id, is_active) with user join
CREATE INDEX IF NOT EXISTS idx_org_members_org_active_user
  ON organization_members(org_id, user_id)
  WHERE is_active = TRUE;
