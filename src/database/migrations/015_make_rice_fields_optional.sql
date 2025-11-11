-- Migration: Make rice_code_id and rice_type optional in leads table
-- Description: Allows leads to be created without rice_code_id and rice_type

-- 1. Make rice_code_id nullable
ALTER TABLE leads ALTER COLUMN rice_code_id DROP NOT NULL;

-- 2. Make rice_type nullable
ALTER TABLE leads ALTER COLUMN rice_type DROP NOT NULL;

-- 3. Update comments to reflect optional nature
COMMENT ON COLUMN leads.rice_code_id IS 'Reference to the rice code for this lead (optional)';
COMMENT ON COLUMN leads.rice_type IS 'Type of rice: basmati, non_basmati, parboiled, or raw (optional)';

