-- Migration: Remove total_bags column from purchases table
-- Description: Removes the total_bags column from purchases table as it's no longer needed

ALTER TABLE purchases
DROP COLUMN IF EXISTS total_bags;

-- Add comment for documentation
COMMENT ON TABLE purchases IS 'Stores purchase execution records (total_bags removed - bags are tracked in inward_slip_lots)';

