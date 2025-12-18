-- Migration: Make business_name optional in brokers table
-- Description: Changes business_name from NOT NULL to nullable to allow brokers without business names

-- 1. Make business_name nullable
ALTER TABLE brokers ALTER COLUMN business_name DROP NOT NULL;

-- 2. Update comments
COMMENT ON COLUMN brokers.business_name IS 'Name of the broker business (optional)';

