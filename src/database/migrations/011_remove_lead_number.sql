-- Migration: Remove lead_number column and related objects
-- Description: Removes lead_number column that was added manually outside migration system
-- This brings the database back to the state after migration 010

-- 1. Drop the unique constraint on lead_number
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_lead_number_key;

-- 2. Drop the index on lead_number
DROP INDEX IF EXISTS idx_leads_lead_number;

-- 3. Drop the lead_number column
ALTER TABLE leads DROP COLUMN IF EXISTS lead_number;

-- 4. Drop the sequence (if it exists independently)
DROP SEQUENCE IF EXISTS leads_lead_number_seq;

