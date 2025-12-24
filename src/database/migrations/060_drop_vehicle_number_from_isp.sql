-- Migration: Drop vehicle_number column from inward_slip_passes
-- Description: Removes the deprecated vehicle_number column now that we're using vehicle_id

-- Drop the vehicle_number column from inward_slip_passes
ALTER TABLE inward_slip_passes DROP COLUMN IF EXISTS vehicle_number;

-- Make vehicle_id NOT NULL (all ISPs should have a vehicle)
ALTER TABLE inward_slip_passes ALTER COLUMN vehicle_id SET NOT NULL;

-- Add comment
COMMENT ON COLUMN inward_slip_passes.vehicle_id IS 'Reference to vehicle entity (required)';


