-- Migration 023: Agent credits
-- --------------------------------
-- Adds a credit balance to each user for the AI Agent feature.
-- Credits are consumed per run (1-3 credits depending on scope
-- and platform count). New users start with 3 free credits.
--
-- Credits can be purchased (payment integration TBD) or granted
-- by an admin (e.g., for Substack followers, beta testers).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS agent_credits INTEGER DEFAULT 3;

-- Grant 3 starter credits to all existing users
UPDATE users SET agent_credits = 3 WHERE agent_credits IS NULL OR agent_credits = 0;

COMMENT ON COLUMN users.agent_credits IS 'AI Agent run credits. Each run costs 1-3 credits. Default 3 free.';
