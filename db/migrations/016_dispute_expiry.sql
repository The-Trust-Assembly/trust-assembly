-- ============================================================
-- 016: Dispute auto-expiry after 48 hours with no votes
-- ============================================================
-- Disputes that receive zero votes within 48 hours of creation
-- expire silently: no penalty, no cooldown, doesn't count as
-- a dispute round for escalation purposes.

-- Add 'expired' status to dispute_status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'expired' AND enumtypid = 'dispute_status'::regtype) THEN
    ALTER TYPE dispute_status ADD VALUE 'expired';
  END IF;
END
$$;
