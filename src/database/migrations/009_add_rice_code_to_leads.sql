-- Migration: Add rice code and rice type to leads
-- Description: Creates rice_type enum, rice_codes table, and adds rice_code_id and rice_type to leads table

-- 1. Create rice_type enum
DO $$ BEGIN
    CREATE TYPE rice_type_enum AS ENUM ('basmati', 'non_basmati', 'parboiled', 'raw');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create rice_codes table
CREATE TABLE IF NOT EXISTS rice_codes (
    rice_code_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rice_code_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- 3. Create a default rice code for existing leads (if any exist)
-- This ensures we can add NOT NULL constraints to leads table
DO $$
DECLARE
    default_rice_code_id UUID;
BEGIN
    -- Check if default rice code exists, if not create it
    SELECT rice_code_id INTO default_rice_code_id
    FROM rice_codes
    WHERE rice_code_name = 'DEFAULT_RICE_CODE'
    LIMIT 1;
    
    IF default_rice_code_id IS NULL THEN
        INSERT INTO rice_codes (rice_code_name)
        VALUES ('DEFAULT_RICE_CODE')
        RETURNING rice_code_id INTO default_rice_code_id;
    END IF;
END $$;

-- 4. Add rice_code_id column to leads (nullable first)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS rice_code_id UUID REFERENCES rice_codes(rice_code_id) ON DELETE RESTRICT;

-- 5. Add rice_type column to leads (nullable first)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS rice_type rice_type_enum;

-- 6. Update existing leads with default values if they don't have values
DO $$
DECLARE
    default_rice_code_id UUID;
BEGIN
    -- Get the default rice code ID
    SELECT rice_code_id INTO default_rice_code_id
    FROM rice_codes
    WHERE rice_code_name = 'DEFAULT_RICE_CODE'
    LIMIT 1;
    
    -- Update existing leads that don't have rice_code_id
    IF default_rice_code_id IS NOT NULL THEN
        UPDATE leads
        SET rice_code_id = default_rice_code_id,
            rice_type = 'basmati'::rice_type_enum
        WHERE rice_code_id IS NULL OR rice_type IS NULL;
    END IF;
END $$;

-- 7. Now make the columns NOT NULL since all existing rows have values
ALTER TABLE leads ALTER COLUMN rice_code_id SET NOT NULL;
ALTER TABLE leads ALTER COLUMN rice_type SET NOT NULL;

-- 8. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_rice_codes_name ON rice_codes(rice_code_name);
CREATE INDEX IF NOT EXISTS idx_leads_rice_code_id ON leads(rice_code_id);
CREATE INDEX IF NOT EXISTS idx_leads_rice_type ON leads(rice_type);

-- 9. Create trigger for auto-updating updated_at on rice_codes
DROP TRIGGER IF EXISTS update_rice_codes_updated_at ON rice_codes;
CREATE TRIGGER update_rice_codes_updated_at 
    BEFORE UPDATE ON rice_codes
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- 10. Add comments
COMMENT ON TYPE rice_type_enum IS 'Enumeration for rice types: basmati, non_basmati, parboiled, raw';
COMMENT ON TABLE rice_codes IS 'Stores rice code information with unique identifiers';
COMMENT ON COLUMN rice_codes.rice_code_id IS 'Primary key identifier for the rice code';
COMMENT ON COLUMN rice_codes.rice_code_name IS 'Name of the rice code';
COMMENT ON COLUMN leads.rice_code_id IS 'Reference to the rice code for this lead';
COMMENT ON COLUMN leads.rice_type IS 'Type of rice: basmati, non_basmati, parboiled, or raw';

