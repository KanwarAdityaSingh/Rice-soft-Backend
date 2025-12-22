-- Migration: Make email column nullable in vendors and brokers tables
-- Description: Since contact_persons now holds emails as an optional array,
-- the legacy email column should be nullable to support vendors/brokers without emails

-- 1. Drop the UNIQUE constraint on vendors.email
ALTER TABLE vendors DROP CONSTRAINT IF EXISTS vendors_email_key;

-- 2. Make vendors.email nullable
ALTER TABLE vendors ALTER COLUMN email DROP NOT NULL;

-- 3. Recreate UNIQUE constraint but allow NULL values
-- PostgreSQL treats NULL values as distinct, so multiple NULLs are allowed
CREATE UNIQUE INDEX IF NOT EXISTS vendors_email_unique_idx ON vendors(email) WHERE email IS NOT NULL;

-- 4. Drop the UNIQUE constraint on brokers.email
ALTER TABLE brokers DROP CONSTRAINT IF EXISTS brokers_email_key;

-- 5. Make brokers.email nullable
ALTER TABLE brokers ALTER COLUMN email DROP NOT NULL;

-- 6. Recreate UNIQUE constraint but allow NULL values
CREATE UNIQUE INDEX IF NOT EXISTS brokers_email_unique_idx ON brokers(email) WHERE email IS NOT NULL;

-- 7. Add comments
COMMENT ON COLUMN vendors.email IS 'Legacy email field (nullable) - primary email is now in contact_persons[0].emails[0]';
COMMENT ON COLUMN brokers.email IS 'Legacy email field (nullable) - primary email is now in contact_persons[0].emails[0]';

