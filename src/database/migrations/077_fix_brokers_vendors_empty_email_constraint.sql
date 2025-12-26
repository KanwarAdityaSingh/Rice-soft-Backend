-- Migration: Fix unique constraint to handle empty strings for email in brokers and vendors
-- Description: Updates unique indexes to exclude both NULL and empty strings, allowing multiple records with empty emails

-- 1. Drop existing unique indexes
DROP INDEX IF EXISTS brokers_email_unique_idx;
DROP INDEX IF EXISTS vendors_email_unique_idx;

-- 2. Convert existing empty strings to NULL in brokers table
UPDATE brokers SET email = NULL WHERE email = '' OR TRIM(email) = '';

-- 3. Convert existing empty strings to NULL in vendors table
UPDATE vendors SET email = NULL WHERE email = '' OR TRIM(email) = '';

-- 4. Recreate unique indexes that exclude both NULL and empty strings
CREATE UNIQUE INDEX brokers_email_unique_idx ON brokers(email) 
WHERE email IS NOT NULL AND TRIM(email) != '';

CREATE UNIQUE INDEX vendors_email_unique_idx ON vendors(email) 
WHERE email IS NOT NULL AND TRIM(email) != '';

-- 5. Add comments
COMMENT ON INDEX brokers_email_unique_idx IS 'Unique index on email, allowing multiple NULL and empty string values';
COMMENT ON INDEX vendors_email_unique_idx IS 'Unique index on email, allowing multiple NULL and empty string values';

