-- Migration: Add auto-incremental batch numbers
-- Description: Changes batch_number generation from timestamp-based to auto-incremental sequential numbers

-- Step 1: Create sequence for batch numbers
CREATE SEQUENCE IF NOT EXISTS batch_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Step 2: Create function to generate sequential batch_number
CREATE OR REPLACE FUNCTION generate_batch_number()
RETURNS TRIGGER AS $$
DECLARE
    next_num INTEGER;
    formatted_num TEXT;
BEGIN
    -- Only generate if batch_number is NULL or empty
    IF NEW.batch_number IS NULL OR TRIM(NEW.batch_number) = '' THEN
        -- Get next sequence value
        next_num := nextval('batch_number_seq');
        
        -- Format as BATCH-001, BATCH-002, etc. (3 digits minimum)
        formatted_num := 'BATCH-' || LPAD(next_num::TEXT, 3, '0');
        
        NEW.batch_number := formatted_num;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Drop old trigger if exists
DROP TRIGGER IF EXISTS generate_batch_number_trigger ON batches;

-- Step 4: Create new trigger to auto-generate batch_number before insert
CREATE TRIGGER generate_batch_number_trigger
    BEFORE INSERT ON batches
    FOR EACH ROW
    EXECUTE FUNCTION generate_batch_number();

-- Step 5: Make batch_number nullable (since it will be auto-generated)
ALTER TABLE batches 
    ALTER COLUMN batch_number DROP NOT NULL;

-- Step 6: Add comments
COMMENT ON SEQUENCE batch_number_seq IS 'Sequence for generating sequential batch numbers';
COMMENT ON COLUMN batches.batch_number IS 'Auto-generated batch number in format BATCH-001, BATCH-002, etc. (can be manually overridden if provided)';

