-- Migration: Add weight fields to inward_slip_passes table
-- Description: Adds full_truck_weight, empty_truck_weight, and kaanta_weight (calculated as full - empty) fields

-- Add weight columns (all nullable)
ALTER TABLE inward_slip_passes ADD COLUMN IF NOT EXISTS full_truck_weight NUMERIC(10, 2);
ALTER TABLE inward_slip_passes ADD COLUMN IF NOT EXISTS empty_truck_weight NUMERIC(10, 2);
ALTER TABLE inward_slip_passes ADD COLUMN IF NOT EXISTS kaanta_weight NUMERIC(10, 2);

-- Create indexes for performance (if needed for queries/filtering)
CREATE INDEX IF NOT EXISTS idx_inward_slip_passes_kaanta_weight ON inward_slip_passes(kaanta_weight) WHERE kaanta_weight IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN inward_slip_passes.full_truck_weight IS 'Weight of truck when fully loaded (in quintals)';
COMMENT ON COLUMN inward_slip_passes.empty_truck_weight IS 'Weight of empty truck (in quintals)';
COMMENT ON COLUMN inward_slip_passes.kaanta_weight IS 'Net weight = full_truck_weight - empty_truck_weight (in quintals)';

