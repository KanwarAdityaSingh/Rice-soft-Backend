-- Migration: Make Inward Slip Pass - Saudas relationship many-to-many
-- Description: Multiple saudas can now be linked to a single inward slip pass via junction table

-- =====================================================
-- STEP 1: Create Junction Table
-- =====================================================

CREATE TABLE IF NOT EXISTS inward_slip_pass_saudas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inward_slip_pass_id UUID NOT NULL REFERENCES inward_slip_passes(id) ON DELETE CASCADE,
    sauda_id UUID NOT NULL REFERENCES saudas(id) ON DELETE RESTRICT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(inward_slip_pass_id, sauda_id)
);

CREATE INDEX IF NOT EXISTS idx_inward_slip_pass_saudas_isp_id 
ON inward_slip_pass_saudas(inward_slip_pass_id);

CREATE INDEX IF NOT EXISTS idx_inward_slip_pass_saudas_sauda_id 
ON inward_slip_pass_saudas(sauda_id);

COMMENT ON TABLE inward_slip_pass_saudas IS 'Junction table linking inward slip passes to saudas (many-to-many)';

-- =====================================================
-- STEP 2: Migrate Existing Data
-- =====================================================

-- Migrate existing sauda_id relationships to junction table
INSERT INTO inward_slip_pass_saudas (inward_slip_pass_id, sauda_id)
SELECT id, sauda_id 
FROM inward_slip_passes 
WHERE sauda_id IS NOT NULL
ON CONFLICT (inward_slip_pass_id, sauda_id) DO NOTHING;

-- =====================================================
-- STEP 3: Remove sauda_id from inward_slip_passes
-- =====================================================

-- Drop the foreign key constraint first
ALTER TABLE inward_slip_passes
DROP CONSTRAINT IF EXISTS inward_slip_passes_sauda_id_fkey;

-- Drop the index
DROP INDEX IF EXISTS idx_inward_slip_passes_sauda_id;

-- Remove sauda_id column
ALTER TABLE inward_slip_passes
DROP COLUMN IF EXISTS sauda_id;

-- =====================================================
-- STEP 4: Update Comments
-- =====================================================

COMMENT ON TABLE inward_slip_passes IS 'Stores inward slip pass documentation - can be linked to multiple saudas via inward_slip_pass_saudas junction table';

