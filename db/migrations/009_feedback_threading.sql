-- Migration 009: Add feedback_replies table for threaded conversations
-- Enables multiple back-and-forth exchanges between users and admins
-- on feedback items, replacing the single admin_reply field.

CREATE TABLE IF NOT EXISTS feedback_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id UUID NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  message TEXT NOT NULL CHECK (length(message) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_replies_feedback_id ON feedback_replies(feedback_id);

-- Add prompt_suggestion column to feedback table
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS prompt_suggestion TEXT CHECK (length(prompt_suggestion) <= 5000);
