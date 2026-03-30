-- ============================================================
-- 014: Add thumbnail_url to submissions
-- ============================================================
-- Stores the og:image / twitter:image URL extracted during import.
-- Used by ContentEmbed component for OG preview cards across the app.

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
