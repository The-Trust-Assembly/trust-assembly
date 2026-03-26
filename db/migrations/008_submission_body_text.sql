-- Migration 008: Add body_text column to submissions
-- Stores article body text captured at submission time for carousel/preview display.
-- Nullable — existing submissions will have NULL (gracefully handled in UI).

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS body_text TEXT;

-- Defense-in-depth: enforce max length at DB level (matches MAX_LENGTHS.body_text in validation.ts)
DO $$ BEGIN
  ALTER TABLE submissions ADD CONSTRAINT body_text_max_len CHECK (length(body_text) <= 100000);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
