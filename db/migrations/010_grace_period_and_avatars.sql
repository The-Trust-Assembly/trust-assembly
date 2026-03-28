-- Migration 010: Add 48-hour grace period for third-party disputes
-- When someone other than the original submitter files a dispute on a rejection,
-- the original submitter gets 48 hours to take over the dispute before jury assignment.

-- Add grace period columns to disputes table
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS grace_period_until TIMESTAMPTZ;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS taken_over_by UUID REFERENCES users(id);
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS taken_over_at TIMESTAMPTZ;

-- Add grace_period status to the enum
-- Note: ALTER TYPE ... ADD VALUE is not transactional in PostgreSQL.
DO $$ BEGIN
  ALTER TYPE dispute_status ADD VALUE IF NOT EXISTS 'grace_period';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add avatars columns (from Phase 3 plan)
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS avatar TEXT;
