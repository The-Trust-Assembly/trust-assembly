-- ============================================================
-- 015: Escalating dispute stakes and cooldowns
-- ============================================================
-- Each successive dispute on the same submission doubles the
-- cooldown period and the reputation stake for both parties.
-- Round 1: 2-day cooldown, 2-point stake
-- Round 2: 4-day cooldown, 4-point stake
-- Round 3: 8-day cooldown, 8-point stake
-- Round N: 2^N days, 2^N points

-- Track which round of dispute this is (1 = first dispute, 2 = second, etc.)
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS dispute_round INTEGER NOT NULL DEFAULT 1;

-- Track the stake for this specific dispute
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS stake_points NUMERIC(6,1) NOT NULL DEFAULT 2.0;

-- Cooldown period: next dispute can't be filed until this timestamp
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS cooldown_until TIMESTAMPTZ;
