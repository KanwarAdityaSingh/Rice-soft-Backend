-- Migration: Add transport_type and aadhar_number to transporters table
-- Description: Adds transport_type enum and aadhar_number field to transporters

-- 1. Create transport_type enum if it doesn't exist
DO $$ BEGIN
    CREATE TYPE transport_type_enum AS ENUM ('registered', 'unregistered');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Add transport_type column with default value
ALTER TABLE transporters ADD COLUMN IF NOT EXISTS transport_type transport_type_enum NOT NULL DEFAULT 'registered';

-- 3. Add aadhar_number column (12 digits, nullable)
ALTER TABLE transporters ADD COLUMN IF NOT EXISTS aadhar_number VARCHAR(12);

-- 4. Add check constraint for aadhar_number format (12 digits)
ALTER TABLE transporters ADD CONSTRAINT transporters_aadhar_number_check 
    CHECK (aadhar_number IS NULL OR (LENGTH(aadhar_number) = 12 AND aadhar_number ~ '^[0-9]{12}$'));

-- 5. Create index for aadhar_number
CREATE INDEX IF NOT EXISTS idx_transporters_aadhar_number ON transporters(aadhar_number) WHERE aadhar_number IS NOT NULL;

-- 6. Add comments
COMMENT ON COLUMN transporters.transport_type IS 'Type of transporter: registered or unregistered';
COMMENT ON COLUMN transporters.aadhar_number IS 'Aadhar number (12 digits) - required for unregistered transporters';

