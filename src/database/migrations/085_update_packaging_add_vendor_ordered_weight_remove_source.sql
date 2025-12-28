-- Migration: Update packaging table - add packaging_vendor_id, add ordered_weight, remove source
-- Description: Adds packaging vendor relationship and ordered weight field, removes source column

-- Step 1: Add packaging_vendor_id column (nullable initially for migration)
ALTER TABLE packaging
ADD COLUMN IF NOT EXISTS packaging_vendor_id UUID REFERENCES packaging_vendors(id) ON DELETE SET NULL;

-- Step 2: Add ordered_weight column (nullable, for initial ordered quantity - static field)
ALTER TABLE packaging
ADD COLUMN IF NOT EXISTS ordered_weight DECIMAL(10,2) CHECK (ordered_weight >= 0);

-- Step 3: Remove source column
ALTER TABLE packaging
DROP COLUMN IF EXISTS source;

-- Step 4: Create index for better performance
CREATE INDEX IF NOT EXISTS idx_packaging_vendor_id ON packaging(packaging_vendor_id) WHERE packaging_vendor_id IS NOT NULL;

-- Step 5: Add comments
COMMENT ON COLUMN packaging.packaging_vendor_id IS 'Reference to packaging vendor who supplies this packaging';
COMMENT ON COLUMN packaging.ordered_weight IS 'Initial ordered weight in kg from vendor (static field, not incremented/decremented)';

