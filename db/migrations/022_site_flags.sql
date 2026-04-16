-- Migration 022: Site flags (key-value store for site-wide settings)
-- -----------------------------------------------------------------
-- Generic key-value table for site-wide configuration that needs to
-- be toggled at runtime without redeployment. First use: the
-- agent_access flag that opens the AI Agent workspace to all users
-- (toggled via the admin system-health dashboard).
--
-- Deliberately small — just key, value, and a timestamp. Value is
-- JSONB for flexibility.

CREATE TABLE IF NOT EXISTS site_flags (
  key       VARCHAR(64) PRIMARY KEY,
  value     JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed the agent_access flag as disabled by default
INSERT INTO site_flags (key, value)
VALUES ('agent_access', '{"enabled": false}')
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE site_flags IS 'Key-value store for site-wide runtime flags';
COMMENT ON COLUMN site_flags.key IS 'Flag identifier (e.g. agent_access)';
COMMENT ON COLUMN site_flags.value IS 'JSONB payload (e.g. {"enabled": true})';
