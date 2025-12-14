-- Migration: Rename rice_quality to rice_type in saudas table
-- Description: Changes rice_quality column to rice_type and updates it to use rice_type_enum

-- 1. Ensure rice_type_enum exists (it should already exist from migration 009)
DO $$ BEGIN
    CREATE TYPE rice_type_enum AS ENUM ('basmati', 'non_basmati', 'parboiled', 'raw');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Add new rice_type column (temporary, will replace rice_quality)
ALTER TABLE saudas ADD COLUMN IF NOT EXISTS rice_type rice_type_enum;

-- 3. Migrate data from rice_quality to rice_type
-- Map existing rice_quality values to enum values
-- If rice_quality contains enum values, use them directly; otherwise set default
UPDATE saudas
SET rice_type = CASE 
    WHEN LOWER(rice_quality) IN ('basmati', 'non_basmati', 'parboiled', 'raw') 
    THEN LOWER(rice_quality)::rice_type_enum
    ELSE 'basmati'::rice_type_enum  -- Default fallback
END
WHERE rice_type IS NULL;

-- 4. Make rice_type NOT NULL (after data migration)
ALTER TABLE saudas ALTER COLUMN rice_type SET NOT NULL;

-- 5. Drop the old rice_quality column
ALTER TABLE saudas DROP COLUMN IF EXISTS rice_quality;

-- 6. Create index for performance
CREATE INDEX IF NOT EXISTS idx_saudas_rice_type ON saudas(rice_type);

-- 7. Update comments
COMMENT ON COLUMN saudas.rice_type IS 'Type of rice: basmati, non_basmati, parboiled, or raw';

