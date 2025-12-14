-- Migration: Add party_pan_number to inward_slip_passes table
-- Description: Adds optional party_pan_number field to store PAN (Permanent Account Number) of the party

-- 1. Add party_pan_number column (nullable)
ALTER TABLE inward_slip_passes ADD COLUMN IF NOT EXISTS party_pan_number VARCHAR(10);

-- 2. Create index for performance (if needed for searches)
CREATE INDEX IF NOT EXISTS idx_inward_slip_passes_party_pan_number ON inward_slip_passes(party_pan_number) WHERE party_pan_number IS NOT NULL;

-- 3. Update comments
COMMENT ON COLUMN inward_slip_passes.party_pan_number IS 'PAN (Permanent Account Number) of the party (10 characters, optional)';

