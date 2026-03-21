-- ============================================================
-- Migration 007: Error Logging, Vault View, Dispute Tracking,
--                and Diagnostic Runs
-- ============================================================
-- Trust Assembly v5 — Transaction Hardening & Error Visibility
-- ============================================================

-- ============================================================
-- 1. CLIENT_ERRORS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS client_errors (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  session_info      TEXT,
  error_type        VARCHAR(30) NOT NULL
                      CHECK (error_type IN ('api_error', 'transaction_error', 'validation_error', 'auth_error', 'client_error')),
  error_message     TEXT NOT NULL,
  error_stack       TEXT,
  api_route         TEXT NOT NULL,
  source_file       TEXT NOT NULL,
  source_function   TEXT NOT NULL,
  line_context      TEXT,
  request_body      JSONB,
  entity_type       VARCHAR(50),
  entity_id         UUID,
  http_method       VARCHAR(10) NOT NULL,
  http_status       INTEGER NOT NULL,
  request_url       TEXT,
  duplicate_count   INTEGER NOT NULL DEFAULT 0,
  last_duplicate_at TIMESTAMPTZ,
  resolved          BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_by       UUID REFERENCES users(id),
  resolved_at       TIMESTAMPTZ,
  resolution_notes  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for client_errors
CREATE INDEX IF NOT EXISTS idx_client_errors_created
  ON client_errors (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_errors_unresolved
  ON client_errors (created_at DESC)
  WHERE resolved = FALSE;

CREATE INDEX IF NOT EXISTS idx_client_errors_route
  ON client_errors (api_route, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_errors_user
  ON client_errors (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_client_errors_entity
  ON client_errors (entity_type, entity_id)
  WHERE entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_client_errors_type
  ON client_errors (error_type);

CREATE INDEX IF NOT EXISTS idx_client_errors_pattern
  ON client_errors (api_route, source_function, created_at DESC)
  WHERE resolved = FALSE;

-- ============================================================
-- 2. UNIFIED VAULT VIEW
-- ============================================================

-- Supporting indexes on vault tables
CREATE INDEX IF NOT EXISTS idx_arguments_org
  ON arguments (org_id);

CREATE INDEX IF NOT EXISTS idx_beliefs_org
  ON beliefs (org_id);

CREATE INDEX IF NOT EXISTS idx_arguments_org_status
  ON arguments (org_id, status);

CREATE INDEX IF NOT EXISTS idx_beliefs_org_status
  ON beliefs (org_id, status);

CREATE INDEX IF NOT EXISTS idx_vault_entries_org_status
  ON vault_entries (org_id, status);

CREATE INDEX IF NOT EXISTS idx_translations_org_status_v2
  ON translations (org_id, status);

-- Unified vault view
CREATE OR REPLACE VIEW vault_artifacts_unified AS
  SELECT
    id,
    org_id,
    submission_id,
    submitted_by,
    'standing_correction'::TEXT AS artifact_type,
    assertion AS content,
    evidence AS detail,
    NULL::TEXT AS original_text,
    NULL::TEXT AS translated_text,
    NULL::TEXT AS translation_subtype,
    status::TEXT AS status,
    survival_count,
    approved_at,
    created_at
  FROM vault_entries

  UNION ALL

  SELECT
    id,
    org_id,
    submission_id,
    submitted_by,
    'argument'::TEXT AS artifact_type,
    content,
    NULL::TEXT AS detail,
    NULL::TEXT AS original_text,
    NULL::TEXT AS translated_text,
    NULL::TEXT AS translation_subtype,
    status::TEXT AS status,
    survival_count,
    approved_at,
    created_at
  FROM arguments

  UNION ALL

  SELECT
    id,
    org_id,
    submission_id,
    submitted_by,
    'belief'::TEXT AS artifact_type,
    content,
    NULL::TEXT AS detail,
    NULL::TEXT AS original_text,
    NULL::TEXT AS translated_text,
    NULL::TEXT AS translation_subtype,
    status::TEXT AS status,
    survival_count,
    approved_at,
    created_at
  FROM beliefs

  UNION ALL

  SELECT
    id,
    org_id,
    submission_id,
    submitted_by,
    'translation'::TEXT AS artifact_type,
    translated_text AS content,
    NULL::TEXT AS detail,
    original_text,
    translated_text,
    translation_type::TEXT AS translation_subtype,
    status::TEXT AS status,
    survival_count,
    approved_at,
    created_at
  FROM translations;

-- ============================================================
-- 3. DISPUTE TRACKING ENHANCEMENTS
-- ============================================================

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS dispute_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS first_disputed_at TIMESTAMPTZ;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS last_disputed_at TIMESTAMPTZ;

-- Backfill from existing disputes (only update rows where values differ)
UPDATE submissions s
SET
  dispute_count     = d.cnt,
  first_disputed_at = d.first_at,
  last_disputed_at  = d.last_at
FROM (
  SELECT
    submission_id,
    COUNT(*)::INTEGER AS cnt,
    MIN(created_at) AS first_at,
    MAX(created_at) AS last_at
  FROM disputes
  GROUP BY submission_id
) d
WHERE s.id = d.submission_id
  AND (
    s.dispute_count     != d.cnt
    OR s.first_disputed_at IS DISTINCT FROM d.first_at
    OR s.last_disputed_at  IS DISTINCT FROM d.last_at
  );

-- ============================================================
-- 4. DIAGNOSTIC RUNS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS diagnostic_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type        VARCHAR(30) NOT NULL
                    CHECK (run_type IN ('full_diagnostic', 'reconciliation', 'ghost_tests_only', 'auto_repair')),
  triggered_by    UUID REFERENCES users(id),
  summary         JSONB NOT NULL,
  full_results    JSONB,
  repairs_applied JSONB,
  duration_ms     INTEGER NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_runs_created
  ON diagnostic_runs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_diagnostic_runs_type_created
  ON diagnostic_runs (run_type, created_at DESC);

-- ============================================================
-- 5. VERIFICATION QUERIES
-- ============================================================

-- Verify client_errors created
SELECT 'client_errors' AS table_name, COUNT(*) AS row_count FROM client_errors;

-- Verify vault_artifacts_unified view
SELECT artifact_type, COUNT(*) AS row_count
FROM vault_artifacts_unified
GROUP BY artifact_type
ORDER BY artifact_type;

-- Verify dispute tracking backfill
SELECT
  (SELECT COUNT(*) FROM submissions) AS total_submissions,
  (SELECT COUNT(*) FROM submissions WHERE dispute_count > 0) AS disputed_submissions,
  (SELECT COUNT(*) FROM disputes) AS total_disputes;

-- Verify diagnostic_runs created
SELECT 'diagnostic_runs' AS table_name, COUNT(*) AS row_count FROM diagnostic_runs;
