-- Migration: Rename sauda_type 'xgodown' to 'exgodown'
-- This migration updates the sauda_type values from 'xgodown' to 'exgodown' for better clarity

-- First, drop the existing CHECK constraint
ALTER TABLE saudas DROP CONSTRAINT IF EXISTS saudas_sauda_type_check;

-- Then update existing saudas table data
UPDATE saudas SET sauda_type = 'exgodown' WHERE sauda_type = 'xgodown';

-- Finally, add the new CHECK constraint with 'exgodown' instead of 'xgodown'
ALTER TABLE saudas ADD CONSTRAINT saudas_sauda_type_check CHECK (sauda_type IN ('exgodown', 'for'));

-- Update any other tables that might reference this value
-- (Add more UPDATE statements here if other tables store sauda_type)

COMMENT ON COLUMN saudas.sauda_type IS 'Type of sauda: exgodown (ex-godown/from warehouse) or for (Free on Rail/Road)';

