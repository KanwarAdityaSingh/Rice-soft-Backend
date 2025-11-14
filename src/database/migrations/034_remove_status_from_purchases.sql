-- Migration: Remove status column from purchases table
-- Description: Removes the status column and related index from purchases table

-- Drop the index first
DROP INDEX IF EXISTS idx_purchases_status;

-- Remove the status column
ALTER TABLE purchases
DROP COLUMN IF EXISTS status;

-- Update comment
COMMENT ON TABLE purchases IS 'Stores purchase execution records (status field removed)';

