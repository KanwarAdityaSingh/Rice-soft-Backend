-- Migration: Add sequential packaging numbers
-- Description: Adds auto-incremental packaging_number field similar to batch_number

-- Step 1: Add packaging_number column (nullable initially)
ALTER TABLE packaging
ADD COLUMN IF NOT EXISTS packaging_number VARCHAR(255);

-- Step 2: Create sequence for packaging numbers
CREATE SEQUENCE IF NOT EXISTS packaging_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Step 3: Create function to generate sequential packaging_number
CREATE OR REPLACE FUNCTION generate_packaging_number()
RETURNS TRIGGER AS $$
DECLARE
    next_num INTEGER;
    formatted_num TEXT;
BEGIN
    -- Only generate if packaging_number is NULL or empty
    IF NEW.packaging_number IS NULL OR TRIM(NEW.packaging_number) = '' THEN
        -- Get next sequence value
        next_num := nextval('packaging_number_seq');
        
        -- Format as PACK-001, PACK-002, etc. (3 digits minimum)
        formatted_num := 'PACK-' || LPAD(next_num::TEXT, 3, '0');
        
        NEW.packaging_number := formatted_num;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Create trigger to auto-generate packaging_number before insert
CREATE TRIGGER generate_packaging_number_trigger
    BEFORE INSERT ON packaging
    FOR EACH ROW
    EXECUTE FUNCTION generate_packaging_number();

-- Step 5: Create unique index on packaging_number
CREATE UNIQUE INDEX IF NOT EXISTS idx_packaging_packaging_number ON packaging(packaging_number) WHERE packaging_number IS NOT NULL;

-- Step 6: Add comments
COMMENT ON SEQUENCE packaging_number_seq IS 'Sequence for generating sequential packaging numbers';
COMMENT ON COLUMN packaging.packaging_number IS 'Auto-generated packaging number in format PACK-001, PACK-002, etc. (can be manually overridden if provided)';

