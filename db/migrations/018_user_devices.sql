-- Migration 018: Push notification device tokens
-- Stores APNs (iOS) and FCM (Android/web) device tokens for push notifications.
-- One user can have multiple devices. One device token maps to one user.

CREATE TABLE IF NOT EXISTS user_devices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_token  VARCHAR(512) NOT NULL UNIQUE,
  platform      VARCHAR(16) NOT NULL DEFAULT 'ios',  -- 'ios', 'android', 'web'
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_token ON user_devices(device_token);

-- Also add user_mode column to users table for follower/contributor mode persistence
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_mode VARCHAR(16) DEFAULT 'follower';

COMMENT ON TABLE user_devices IS 'Push notification device tokens for iOS (APNs) and Android (FCM)';
COMMENT ON COLUMN users.user_mode IS 'User experience mode: follower (read-only) or contributor (full access)';
