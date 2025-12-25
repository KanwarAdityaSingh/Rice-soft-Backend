-- Migration: Make email column nullable in leads table
-- Since we removed separate email field from lead validation,
-- email should be nullable (contact info now comes from contact_persons array)

-- Make email column nullable
ALTER TABLE leads ALTER COLUMN email DROP NOT NULL;

-- Add comment to clarify the change
COMMENT ON COLUMN leads.email IS 'Legacy email field (deprecated - use contact_persons array instead). Kept for backward compatibility.';

