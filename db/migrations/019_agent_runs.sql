-- Migration 019: Trust Assembly Agent runs
-- ------------------------------------------
-- Stores AI-powered fact-checking runs. Each row represents one pipeline
-- execution: the user submits a thesis and scope, the agent searches for
-- articles, fetches and analyzes them, synthesizes findings, and produces
-- a reviewable batch. The user then approves the batch and it gets filed
-- via the existing /api/submissions flow.
--
-- Columns:
--   Input              : thesis, scope, context (who/what/when/where/why + evidence)
--   Lifecycle          : status, stage_message, progress_pct
--   Output             : articles_*, batch (full reviewable payload as JSONB)
--   Cost tracking      : input_tokens, output_tokens, estimated_cost_usd
--   Error / timestamps : error_message, created/updated/completed_at
--
-- The `batch` JSONB column holds the full synthesized result — submissions,
-- vault entries, narrative, analysis errors. Storing as a single JSONB blob
-- matches the desktop app's in-memory model and avoids premature
-- normalization. If the review UI needs to query across runs later, we can
-- promote fields out of the blob at that time.

CREATE TABLE IF NOT EXISTS agent_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Input
  thesis              TEXT NOT NULL,
  scope               VARCHAR(32) NOT NULL,
  context             JSONB,

  -- Lifecycle
  status              VARCHAR(32) NOT NULL DEFAULT 'queued',
  stage_message       TEXT,
  progress_pct        INTEGER DEFAULT 0,

  -- Output
  articles_found      INTEGER DEFAULT 0,
  articles_fetched    INTEGER DEFAULT 0,
  articles_analyzed   INTEGER DEFAULT 0,
  batch               JSONB,

  -- Cost tracking
  input_tokens        INTEGER DEFAULT 0,
  output_tokens       INTEGER DEFAULT 0,
  estimated_cost_usd  NUMERIC(10, 4) DEFAULT 0,

  -- Error
  error_message       TEXT,

  -- Timestamps
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  completed_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_user_id ON agent_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);
CREATE INDEX IF NOT EXISTS idx_agent_runs_created_at ON agent_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_user_created ON agent_runs(user_id, created_at DESC);

COMMENT ON TABLE agent_runs IS 'Trust Assembly Agent AI-powered fact-checking runs';
COMMENT ON COLUMN agent_runs.status IS 'queued|searching|fetching|analyzing|synthesizing|ready|submitting|completed|failed|cancelled';
COMMENT ON COLUMN agent_runs.batch IS 'Full reviewable batch: { submissions, vaultEntries, narrative, errors }';
COMMENT ON COLUMN agent_runs.context IS '{ who, what, when, where, why, evidenceLinks, evidenceNotes }';
