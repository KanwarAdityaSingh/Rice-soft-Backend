-- Migration: Move transporter_id and transportation_cost from saudas to inward_slip_passes
-- Description: Transportation details are now tracked at the Inward Slip Pass level instead of Sauda level

-- =====================================================
-- STEP 1: Add columns to inward_slip_passes
-- =====================================================

ALTER TABLE inward_slip_passes
ADD COLUMN IF NOT EXISTS transporter_id UUID REFERENCES transporters(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS transportation_cost DECIMAL(10,2);

-- Create index on transporter_id
CREATE INDEX IF NOT EXISTS idx_inward_slip_passes_transporter_id 
ON inward_slip_passes(transporter_id) 
WHERE transporter_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN inward_slip_passes.transporter_id IS 'Transporter responsible for this inward slip pass';
COMMENT ON COLUMN inward_slip_passes.transportation_cost IS 'Transportation cost for this inward slip pass';

-- =====================================================
-- STEP 2: Migrate existing data from saudas to inward_slip_passes
-- =====================================================

-- For each sauda that has transporter_id or transportation_cost,
-- copy those values to all inward_slip_passes linked to that sauda
UPDATE inward_slip_passes isp
SET 
  transporter_id = s.transporter_id,
  transportation_cost = s.transportation_cost
FROM saudas s
WHERE isp.sauda_id = s.id
AND (s.transporter_id IS NOT NULL OR s.transportation_cost IS NOT NULL)
AND (isp.transporter_id IS NULL AND isp.transportation_cost IS NULL);

-- =====================================================
-- STEP 3: Remove columns from saudas
-- =====================================================

-- Drop the foreign key constraint first
ALTER TABLE saudas
DROP CONSTRAINT IF EXISTS saudas_transporter_id_fkey;

-- Drop the index
DROP INDEX IF EXISTS idx_saudas_transporter_id;

-- Remove columns from saudas
ALTER TABLE saudas
DROP COLUMN IF EXISTS transporter_id,
DROP COLUMN IF EXISTS transportation_cost;

-- =====================================================
-- STEP 4: Update comments
-- =====================================================

-- Remove old comments (they will be automatically removed with columns)
-- No action needed as columns are dropped


