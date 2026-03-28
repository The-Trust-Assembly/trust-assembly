-- Migration 010: Add avatar columns for user and assembly profile pictures
-- Stored as base64 data URLs (max ~200KB after client-side compression)
-- User avatars: circular, shown next to username
-- Assembly avatars: square, shown on submission cards and assembly pages

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS avatar TEXT;
