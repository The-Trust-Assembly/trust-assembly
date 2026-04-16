-- Migration 020: Trust Assembly Agent — agent_instances
-- -------------------------------------------------------
-- Persistent store for agent configurations. One row per agent instance
-- (users can have many, up to 12). Each instance is a Sentinel, Phantom,
-- or Ward with its own domain focus, reputation, and settings.
--
-- Type-specific configuration (Phantom's Substack URL, Ward's monitored
-- entities, etc.) lives in a JSONB `config` column to avoid a proliferation
-- of nullable columns.
--
-- Columns:
--   Identity       : name, type, domain, color
--   Reputation     : reputation score, runs_completed
--   Lifecycle      : status (setup|active|paused|idle)
--   Behavior       : reasoning_instructions (prepended to every run),
--                    monthly_spend_limit ($ cap; pauses agent when hit)
--   Type config    : config (JSONB)

CREATE TABLE IF NOT EXISTS agent_instances (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Identity
  name                  TEXT NOT NULL,
  type                  VARCHAR(16) NOT NULL,
  domain                TEXT,
  color                 VARCHAR(16),

  -- Reputation + stats
  reputation            INTEGER DEFAULT 0,
  runs_completed        INTEGER DEFAULT 0,

  -- Lifecycle
  status                VARCHAR(16) NOT NULL DEFAULT 'setup',

  -- Persistent agent behavior
  reasoning_instructions TEXT,
  monthly_spend_limit   NUMERIC(10, 2),

  -- Type-specific configuration
  config                JSONB,

  -- Timestamps
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_instances_user_id
  ON agent_instances(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_instances_user_status
  ON agent_instances(user_id, status);

COMMENT ON TABLE agent_instances IS 'Trust Assembly Agent instances (Sentinel, Phantom, Ward)';
COMMENT ON COLUMN agent_instances.type IS 'sentinel | phantom | ward';
COMMENT ON COLUMN agent_instances.status IS 'setup | active | paused | idle';
COMMENT ON COLUMN agent_instances.config IS 'Type-specific config: Phantom={substackUrl, scanFrequency, autoScan}, Ward={monitoredEntities:string[]}, Sentinel={}';
COMMENT ON COLUMN agent_instances.reasoning_instructions IS 'Persistent instructions prepended to every run of this agent';
COMMENT ON COLUMN agent_instances.monthly_spend_limit IS 'USD cap per calendar month; agent pauses when reached';
