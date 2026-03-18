-- ============================================================
-- Migration 004: Story Pages
-- Adds tables for wiki-like "story pages" that track real-world
-- events across multiple submissions. Stories go through the
-- same jury approval pipeline as submissions, including
-- cross-group promotion to consensus.
-- ============================================================

-- 1. Stories table
CREATE TABLE IF NOT EXISTS stories (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES organizations(id),
  title                 VARCHAR(300) NOT NULL,
  description           TEXT NOT NULL,
  status                submission_status NOT NULL DEFAULT 'pending_jury',
  submitted_by          UUID NOT NULL REFERENCES users(id),
  jury_seed             BIGINT,
  jury_seats            INTEGER,
  cross_group_jury_size INTEGER,
  cross_group_seed      BIGINT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at           TIMESTAMPTZ,
  resolved_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_stories_org ON stories(org_id);
CREATE INDEX IF NOT EXISTS idx_stories_status ON stories(status);
CREATE INDEX IF NOT EXISTS idx_stories_created ON stories(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stories_submitted_by ON stories(submitted_by);
CREATE INDEX IF NOT EXISTS idx_stories_search ON stories
  USING gin(to_tsvector('english', title || ' ' || description));

-- 2. Story-submissions junction table (many-to-many with approval)
CREATE TABLE IF NOT EXISTS story_submissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id        UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  submission_id   UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  tagged_by       UUID NOT NULL REFERENCES users(id),
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',
  approved_by     UUID REFERENCES users(id),
  tagged_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at     TIMESTAMPTZ,
  UNIQUE(story_id, submission_id)
);

CREATE INDEX IF NOT EXISTS idx_story_subs_story ON story_submissions(story_id);
CREATE INDEX IF NOT EXISTS idx_story_subs_submission ON story_submissions(submission_id);
CREATE INDEX IF NOT EXISTS idx_story_subs_status ON story_submissions(status);

-- 3. Add story_id to jury_assignments and jury_votes
ALTER TABLE jury_assignments ADD COLUMN IF NOT EXISTS story_id UUID REFERENCES stories(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_jury_story ON jury_assignments(story_id) WHERE story_id IS NOT NULL;

ALTER TABLE jury_votes ADD COLUMN IF NOT EXISTS story_id UUID REFERENCES stories(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_votes_story ON jury_votes(story_id) WHERE story_id IS NOT NULL;

-- 4. Update UNIQUE constraints to include story_id
-- Drop old constraints and recreate with story_id included
ALTER TABLE jury_assignments
  DROP CONSTRAINT IF EXISTS jury_assignments_submission_id_dispute_id_concession_id_us_key,
  DROP CONSTRAINT IF EXISTS jury_assignments_unique;
ALTER TABLE jury_assignments
  ADD CONSTRAINT jury_assignments_unique
    UNIQUE(submission_id, dispute_id, concession_id, story_id, user_id, role);

ALTER TABLE jury_votes
  DROP CONSTRAINT IF EXISTS jury_votes_submission_id_dispute_id_concession_id_user_id_r_key,
  DROP CONSTRAINT IF EXISTS jury_votes_unique;
ALTER TABLE jury_votes
  ADD CONSTRAINT jury_votes_unique
    UNIQUE(submission_id, dispute_id, concession_id, story_id, user_id, role);
