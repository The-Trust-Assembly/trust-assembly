-- Migration 027: Four-score model, score ledger, Marks economy
-- ----------------------------------------------------------------
-- Foundation for DESIGN-SPEC-scoring-lifecycle.md (Part A).
--
-- citizen_scores: one tally row per user × role × scope (× org for
-- assembly scope). Scores are always derived as:
--   displayed % = (points_earned + rescue_bonus) / points_possible
--                 / (1 + deception_findings)
-- The math lives in src/lib/scoring/engine.ts — this table only
-- stores the tallies.
--
-- score_events: append-only ledger. Every accrual, bonus, and penalty
-- is a visible, named event (the spec forbids silent recalculation).
--
-- marks: imaginary, non-convertible currency for dispute friction and
-- juror pay. Trust scores are never purchasable.

CREATE TABLE IF NOT EXISTS citizen_scores (
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role               VARCHAR(12) NOT NULL CHECK (role IN ('submitter', 'juror')),
  scope              VARCHAR(12) NOT NULL CHECK (scope IN ('assembly', 'system')),
  org_id             UUID REFERENCES organizations(id) ON DELETE CASCADE, -- NULL for system scope
  points_earned      NUMERIC(12, 1) NOT NULL DEFAULT 0,
  points_possible    NUMERIC(12, 1) NOT NULL DEFAULT 0,
  rescue_bonus       NUMERIC(12, 1) NOT NULL DEFAULT 0,
  deception_findings INTEGER NOT NULL DEFAULT 0,
  updated_at         TIMESTAMPTZ DEFAULT now()
);

-- org_id is NULL for system scope, so the uniqueness needs a COALESCE
CREATE UNIQUE INDEX IF NOT EXISTS idx_citizen_scores_identity
  ON citizen_scores (user_id, role, scope, COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS idx_citizen_scores_user ON citizen_scores (user_id);

CREATE TABLE IF NOT EXISTS score_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            VARCHAR(12) NOT NULL CHECK (role IN ('submitter', 'juror')),
  scope           VARCHAR(12) NOT NULL CHECK (scope IN ('assembly', 'system')),
  org_id          UUID REFERENCES organizations(id) ON DELETE SET NULL,
  event_type      VARCHAR(28) NOT NULL,
    -- item_adjudicated | juror_vote_scored | cassandra_bonus |
    -- whistleblower_bonus | deception_finding | backfill
  submission_id   UUID REFERENCES submissions(id) ON DELETE SET NULL,
  dispute_id      UUID REFERENCES disputes(id) ON DELETE SET NULL,
  item_type       VARCHAR(32),   -- ScoredItemType, when applicable
  quality         VARCHAR(8),    -- low | normal | high
  points_earned   NUMERIC(8, 1) NOT NULL DEFAULT 0,
  points_possible NUMERIC(8, 1) NOT NULL DEFAULT 0,
  bonus           NUMERIC(10, 1) NOT NULL DEFAULT 0,
  detail          JSONB,         -- e.g. { "rejectionDepth": 3, "submissionPoints": 20 }
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_score_events_user ON score_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_score_events_submission ON score_events (submission_id);

-- ─── Marks economy ─────────────────────────────────────────────────

ALTER TABLE users ADD COLUMN IF NOT EXISTS marks_balance INTEGER NOT NULL DEFAULT 100;

CREATE TABLE IF NOT EXISTS marks_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount        INTEGER NOT NULL,        -- positive = credit, negative = debit
  reason        VARCHAR(32) NOT NULL,
    -- new_citizen_grant | dispute_stake | juror_pay | submission_passed |
    -- review_completed | vindication_refund | vindication_bonus | admin_grant
  dispute_id    UUID REFERENCES disputes(id) ON DELETE SET NULL,
  submission_id UUID REFERENCES submissions(id) ON DELETE SET NULL,
  detail        JSONB,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marks_tx_user ON marks_transactions (user_id, created_at DESC);

COMMENT ON TABLE citizen_scores IS 'Four-score tallies: submitter/juror × assembly/system (spec A1)';
COMMENT ON TABLE score_events IS 'Append-only score ledger — visible, named events (spec A6/A12)';
COMMENT ON TABLE marks_transactions IS 'Imaginary Marks currency ledger for dispute stakes and juror pay (spec A9)';
COMMENT ON COLUMN users.marks_balance IS 'Marks wallet; new citizens start with 100 (spec A9)';
