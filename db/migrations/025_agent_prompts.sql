-- Migration 025: Agent prompt presets
-- --------------------------------------
-- Stores editable prompt templates for each phase of the agent
-- pipeline. Prompts are read from this table at runtime instead
-- of being hardcoded in the source. The admin can edit them
-- from the system-health dashboard without redeploying.
--
-- Each prompt has a unique key (e.g. 'analyze_system',
-- 'analyze_instructions', 'translation_rules') and a text body.
-- The pipeline reads the latest version at runtime.

CREATE TABLE IF NOT EXISTS agent_prompts (
  key         VARCHAR(64) PRIMARY KEY,
  label       VARCHAR(200) NOT NULL,
  description TEXT,
  body        TEXT NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  updated_by  VARCHAR(200)
);

COMMENT ON TABLE agent_prompts IS 'Editable prompt templates for the agent pipeline';
COMMENT ON COLUMN agent_prompts.key IS 'Unique identifier: analyze_system, translation_rules, etc.';
COMMENT ON COLUMN agent_prompts.body IS 'The actual prompt text with {{VARIABLE}} placeholders';
