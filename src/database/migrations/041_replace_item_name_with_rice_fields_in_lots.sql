-- Migration: Replace item_name with rice_code_id and rice_type in inward_slip_lots table
-- Description: Changes item_name VARCHAR to rice_code_id UUID and rice_type enum to match Lead/Sauda structure

-- 1. Ensure rice_type_enum exists (it should already exist from migration 009)
DO $$ BEGIN
    CREATE TYPE rice_type_enum AS ENUM ('basmati', 'non_basmati', 'parboiled', 'raw');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Add new rice_code_id column (nullable)
ALTER TABLE inward_slip_lots ADD COLUMN IF NOT EXISTS rice_code_id UUID REFERENCES rice_codes(rice_code_id) ON DELETE SET NULL;

-- 3. Add new rice_type column (nullable)
ALTER TABLE inward_slip_lots ADD COLUMN IF NOT EXISTS rice_type rice_type_enum;

-- 4. Note: We cannot automatically migrate data from item_name to rice_code_id/rice_type
--    as item_name is a free text field and cannot be reliably mapped to rice codes
--    Existing data will have NULL values for rice_code_id and rice_type
--    Users will need to update lots manually or via API

-- 5. Drop the old item_name column
ALTER TABLE inward_slip_lots DROP COLUMN IF EXISTS item_name;

-- 6. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_inward_slip_lots_rice_code_id ON inward_slip_lots(rice_code_id) WHERE rice_code_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inward_slip_lots_rice_type ON inward_slip_lots(rice_type) WHERE rice_type IS NOT NULL;

-- 7. Update comments
COMMENT ON COLUMN inward_slip_lots.rice_code_id IS 'Reference to the rice code for this lot (optional)';
COMMENT ON COLUMN inward_slip_lots.rice_type IS 'Type of rice: basmati, non_basmati, parboiled, or raw (optional)';

