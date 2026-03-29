-- ============================================================
-- 011: Add jury_seats to disputes table
-- ============================================================
-- Disputes need to track the required jury size (like submissions do)
-- so the UI can show correct vote progress (e.g., "0/1" not "0/42").

ALTER TABLE disputes ADD COLUMN IF NOT EXISTS jury_seats INTEGER;

-- Backfill: all existing pending disputes are in Wild West mode (jury size 1)
UPDATE disputes SET jury_seats = 1 WHERE jury_seats IS NULL AND status = 'pending_review';
