-- ============================================================
-- Migration 001: KV Store Elimination
-- Adds tables and columns needed to migrate from KV store
-- to direct SQL queries for all read paths.
-- ============================================================

-- 1. Add normalized_url to submissions for fast URL lookups
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS normalized_url TEXT;

CREATE INDEX IF NOT EXISTS idx_submissions_normalized_url
  ON submissions(normalized_url) WHERE normalized_url IS NOT NULL;

-- 2. Create organization_follows table
-- (Already referenced by /api/orgs/[id]/follow but missing from schema)
CREATE TABLE IF NOT EXISTS organization_follows (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_follows_user ON organization_follows(user_id);
CREATE INDEX IF NOT EXISTS idx_org_follows_org ON organization_follows(org_id);

-- 3. Create notifications table for lifecycle events
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR(50) NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT,
  entity_type VARCHAR(50),
  entity_id   UUID,
  read        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, created_at DESC) WHERE read = FALSE;

-- 4. Create user_badges table
CREATE TABLE IF NOT EXISTS user_badges (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id   VARCHAR(100) NOT NULL,
  detail     TEXT,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, badge_id)
);

-- 5. Formalize kv_store table (already exists at runtime)
CREATE TABLE IF NOT EXISTS kv_store (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Backfill normalized_url from existing submissions
-- Uses the raw url as a starting point; the application normalizes on write going forward.
UPDATE submissions SET normalized_url = url WHERE normalized_url IS NULL;
