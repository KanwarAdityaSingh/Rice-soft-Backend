-- Migration: Add packaging weight enum
-- Description: Creates enum for packaging weights (10, 25, 50 kg)

-- Create packaging_weight_enum
DO $$ BEGIN
    CREATE TYPE packaging_weight_enum AS ENUM ('10', '25', '50');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add comment
COMMENT ON TYPE packaging_weight_enum IS 'Enum for packaging holding capacity: 10kg, 25kg, or 50kg';

