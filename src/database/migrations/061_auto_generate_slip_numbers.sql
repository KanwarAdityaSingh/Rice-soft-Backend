-- Migration: Auto-generate sequential slip numbers
-- Description: Creates sequence and trigger to auto-generate slip numbers in format ISP-001, ISP-002, etc.

-- Create sequence for slip numbers
CREATE SEQUENCE IF NOT EXISTS inward_slip_pass_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Create function to generate slip_number
CREATE OR REPLACE FUNCTION generate_slip_number()
RETURNS TRIGGER AS $$
DECLARE
    next_num INTEGER;
    formatted_num TEXT;
BEGIN
    -- Only generate if slip_number is NULL or empty
    IF NEW.slip_number IS NULL OR TRIM(NEW.slip_number) = '' THEN
        -- Get next sequence value
        next_num := nextval('inward_slip_pass_number_seq');
        
        -- Format as ISP-001, ISP-002, etc. (3 digits minimum)
        formatted_num := 'ISP-' || LPAD(next_num::TEXT, 3, '0');
        
        NEW.slip_number := formatted_num;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-generate slip_number before insert
CREATE TRIGGER generate_slip_number_trigger
    BEFORE INSERT ON inward_slip_passes
    FOR EACH ROW
    EXECUTE FUNCTION generate_slip_number();

-- Make slip_number nullable (since it will be auto-generated)
ALTER TABLE inward_slip_passes 
    ALTER COLUMN slip_number DROP NOT NULL;

-- Add comment
COMMENT ON SEQUENCE inward_slip_pass_number_seq IS 'Sequence for generating sequential inward slip pass numbers';
COMMENT ON COLUMN inward_slip_passes.slip_number IS 'Auto-generated slip number in format ISP-001, ISP-002, etc. (can be manually overridden if provided)';

