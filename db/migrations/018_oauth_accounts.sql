-- ============================================================
-- 018: OAuth accounts + schema changes for social sign-in
-- ============================================================

-- OAuth accounts linking table (supports multiple providers per user)
CREATE TABLE IF NOT EXISTS oauth_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider      VARCHAR(20) NOT NULL,
  provider_id   VARCHAR(255) NOT NULL,
  provider_email VARCHAR(320),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_provider ON oauth_accounts(provider, provider_id);
CREATE INDEX IF NOT EXISTS idx_oauth_user ON oauth_accounts(user_id);

-- Allow OAuth-only users (no password required)
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ALTER COLUMN salt DROP NOT NULL;

-- Track whether OAuth user has completed demographics capture
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_complete BOOLEAN NOT NULL DEFAULT TRUE;
