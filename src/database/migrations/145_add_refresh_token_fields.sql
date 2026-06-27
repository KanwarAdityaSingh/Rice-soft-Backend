-- Migration: Refresh token storage for rotating session refresh
-- Description: Stores hashed refresh token and expiry tied to active_session_id

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS refresh_token_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS refresh_token_expires_at TIMESTAMPTZ;

COMMENT ON COLUMN users.refresh_token_hash IS 'SHA-256 hex hash of the current opaque refresh token';
COMMENT ON COLUMN users.refresh_token_expires_at IS 'When the current refresh token expires; access JWT may be shorter';
