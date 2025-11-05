-- Make user email optional
-- This migration makes the email column nullable and ensures uniqueness only for non-null emails

-- 1. Drop the existing unique constraint on email (if it exists)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;

-- 2. Alter the email column to allow NULL
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

-- 3. Create a partial unique index to ensure uniqueness only for non-null emails
-- This allows multiple NULL values but ensures non-null emails are unique
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique 
ON users(email) 
WHERE email IS NOT NULL;

-- 4. Add comment for documentation
COMMENT ON COLUMN users.email IS 'User email address (optional, unique when provided)';

