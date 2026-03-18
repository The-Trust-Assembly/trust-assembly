-- Migration 005: Submission Drafts
-- Server-side draft storage for cross-device submission persistence

CREATE TABLE submission_drafts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url           VARCHAR(2000),
  title         VARCHAR(500),
  draft_data    JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, url)
);

CREATE INDEX idx_drafts_user ON submission_drafts(user_id);
CREATE INDEX idx_drafts_user_url ON submission_drafts(user_id, url);
CREATE INDEX idx_drafts_updated ON submission_drafts(updated_at DESC);
