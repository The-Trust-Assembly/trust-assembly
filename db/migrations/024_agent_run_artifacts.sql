-- Migration 024: Agent run artifacts
-- ------------------------------------
-- Per-phase, per-article storage for the agent pipeline. Each row is
-- one artifact from one phase — a search candidate, a fetched article,
-- an analysis result, or a vault entry. Replaces the monolithic
-- batch._checkpoint JSONB blob with individual rows that can be
-- written incrementally and queried independently.
--
-- This supports:
--   - Concurrent users without JSONB contention
--   - Individual article progress (each analysis saves independently)
--   - Efficient retry (query "which articles are already analyzed?")
--   - Admin visibility into exactly where a run stopped

CREATE TABLE IF NOT EXISTS agent_run_artifacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  phase           VARCHAR(32) NOT NULL,
  article_url     TEXT,
  artifact_type   VARCHAR(32) NOT NULL,
  data            JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_artifacts_run_id
  ON agent_run_artifacts(run_id);
CREATE INDEX IF NOT EXISTS idx_agent_artifacts_run_phase
  ON agent_run_artifacts(run_id, phase);
CREATE INDEX IF NOT EXISTS idx_agent_artifacts_run_type
  ON agent_run_artifacts(run_id, artifact_type);

COMMENT ON TABLE agent_run_artifacts IS 'Per-phase per-article artifacts for agent pipeline runs';
COMMENT ON COLUMN agent_run_artifacts.phase IS 'search | fetch | analyze | synthesize | verify';
COMMENT ON COLUMN agent_run_artifacts.artifact_type IS 'candidate | fetched_text | analysis | vault_entry | narrative';
