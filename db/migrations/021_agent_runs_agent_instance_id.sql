-- Migration 021: Link agent_runs to agent_instances
-- ---------------------------------------------------
-- Adds a nullable foreign key so each run can be attributed to the agent
-- instance that produced it. Nullable so:
--   1. Existing runs from before Stage A keep working
--   2. Future one-time runs (no instance required) still work
--
-- ON DELETE SET NULL preserves run history even if an agent instance is
-- deleted — the run data remains, it just becomes unlinked.

ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS agent_instance_id UUID
  REFERENCES agent_instances(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_instance_id
  ON agent_runs(agent_instance_id);

COMMENT ON COLUMN agent_runs.agent_instance_id IS 'FK to agent_instances; NULL for one-time runs and legacy runs';
