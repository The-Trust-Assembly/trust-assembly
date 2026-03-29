-- ============================================================
-- 013: Add platform-specific metadata columns to submissions
-- ============================================================
-- Supports the adaptive submit form's 5 templates (article,
-- shortform, video, audio, product) by storing template-specific
-- metadata alongside the core submission fields.

-- Platform/template detection result
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS platform_type VARCHAR(50);

-- Podcast/Audio fields
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS podcast_show_name VARCHAR(300);
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS podcast_guest_speaker VARCHAR(200);
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS episode_duration VARCHAR(20);
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS claim_timestamp VARCHAR(20);

-- Product/Listing fields
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS product_claim_category VARCHAR(100);
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS product_brand_seller VARCHAR(200);

-- Cross-template fields
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS publication_name VARCHAR(300);
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS thread_position INTEGER;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS referenced_link TEXT;
