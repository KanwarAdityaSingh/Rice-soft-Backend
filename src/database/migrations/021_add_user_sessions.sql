-- Migration: Add user session tracking
-- Description: Adds active_session_id column to users table for single-device session enforcement

-- Add active_session_id column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS active_session_id VARCHAR(255);

-- Create index for faster session lookups
CREATE INDEX IF NOT EXISTS idx_users_active_session ON users(active_session_id);

-- Add comment
COMMENT ON COLUMN users.active_session_id IS 'Current active session ID for single-device enforcement. When user logs in, previous sessions are invalidated.';

