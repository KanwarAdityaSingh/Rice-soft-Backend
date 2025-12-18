-- Migration: Rename sauda_type 'xgodown' to 'exgodown'
-- This migration updates the sauda_type values from 'xgodown' to 'exgodown' for better clarity

-- Update existing saudas table data
UPDATE saudas SET sauda_type = 'exgodown' WHERE sauda_type = 'xgodown';

-- Update the CHECK constraint on saudas table
ALTER TABLE saudas DROP CONSTRAINT IF EXISTS saudas_sauda_type_check;
ALTER TABLE saudas ADD CONSTRAINT saudas_sauda_type_check CHECK (sauda_type IN ('exgodown', 'for'));

-- Update any other tables that might reference this value
-- (Add more UPDATE statements here if other tables store sauda_type)

COMMENT ON COLUMN saudas.sauda_type IS 'Type of sauda: exgodown (ex-godown/from warehouse) or for (Free on Rail/Road)';

