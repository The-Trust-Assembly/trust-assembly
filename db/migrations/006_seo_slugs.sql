-- ============================================================
-- Migration 006: SEO-friendly slugs
-- Adds slug columns to submissions, stories, vault_entries,
-- and organizations for human-readable, crawlable URLs.
-- ============================================================

-- 1. Organizations — add slug column (some may already have it from smoke-test usage)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS slug VARCHAR(250);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orgs_slug ON organizations(slug) WHERE slug IS NOT NULL;

-- 2. Submissions — add slug column
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS slug VARCHAR(500);
CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_slug ON submissions(slug) WHERE slug IS NOT NULL;

-- 3. Stories — add slug column
ALTER TABLE stories ADD COLUMN IF NOT EXISTS slug VARCHAR(350);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stories_slug ON stories(slug) WHERE slug IS NOT NULL;

-- 4. Vault entries — add slug column
ALTER TABLE vault_entries ADD COLUMN IF NOT EXISTS slug VARCHAR(350);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vault_entries_slug ON vault_entries(slug) WHERE slug IS NOT NULL;

-- 5. Backfill organization slugs from existing names
UPDATE organizations
SET slug = lower(
  regexp_replace(
    regexp_replace(
      regexp_replace(name, '[^a-zA-Z0-9\s-]', '', 'g'),  -- strip non-alphanumeric
      '\s+', '-', 'g'                                      -- spaces to hyphens
    ),
    '-+', '-', 'g'                                         -- collapse multiple hyphens
  )
)
WHERE slug IS NULL;

-- 6. Backfill submission slugs from original_headline
UPDATE submissions
SET slug = left(
  lower(
    regexp_replace(
      regexp_replace(
        regexp_replace(original_headline, '[^a-zA-Z0-9\s-]', '', 'g'),
        '\s+', '-', 'g'
      ),
      '-+', '-', 'g'
    )
  ),
  80
) || '-' || left(id::text, 8)
WHERE slug IS NULL;

-- 7. Backfill story slugs from title
UPDATE stories
SET slug = left(
  lower(
    regexp_replace(
      regexp_replace(
        regexp_replace(title, '[^a-zA-Z0-9\s-]', '', 'g'),
        '\s+', '-', 'g'
      ),
      '-+', '-', 'g'
    )
  ),
  80
) || '-' || left(id::text, 8)
WHERE slug IS NULL;

-- 8. Backfill vault entry slugs from assertion
UPDATE vault_entries
SET slug = left(
  lower(
    regexp_replace(
      regexp_replace(
        regexp_replace(assertion, '[^a-zA-Z0-9\s-]', '', 'g'),
        '\s+', '-', 'g'
      ),
      '-+', '-', 'g'
    )
  ),
  80
) || '-' || left(id::text, 8)
WHERE slug IS NULL;
