-- Migration: Remove bardana column from inward_slip_lots table
-- Description: Drops the bardana column as it's no longer needed

-- Drop the bardana column
ALTER TABLE inward_slip_lots DROP COLUMN IF EXISTS bardana;

-- Add comment
COMMENT ON TABLE inward_slip_lots IS 'Stores individual lots - bardana field removed';

