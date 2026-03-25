-- Migration 008: Add body_text column to submissions
-- Stores article body text captured at submission time for carousel/preview display.
-- Nullable — existing submissions will have NULL (gracefully handled in UI).

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS body_text TEXT;
