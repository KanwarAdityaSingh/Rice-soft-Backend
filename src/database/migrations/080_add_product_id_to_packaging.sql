-- Migration: Add product_id to packaging table
-- Description: Makes packaging product-specific by adding product_id foreign key

-- Step 1: Add product_id column (nullable initially for migration)
ALTER TABLE packaging
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE CASCADE;

-- Step 2: Create index for better performance
CREATE INDEX IF NOT EXISTS idx_packaging_product_id ON packaging(product_id);

-- Step 3: Add CHECK constraint for holding_capacity (must be 10, 25, or 50)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'check_holding_capacity_valid'
    ) THEN
        ALTER TABLE packaging
        ADD CONSTRAINT check_holding_capacity_valid
        CHECK (holding_capacity IN (10, 25, 50));
    END IF;
END $$;

-- Step 4: Drop old unique constraint
ALTER TABLE packaging
DROP CONSTRAINT IF EXISTS packaging_holding_capacity_packet_type_key;

-- Step 5: Add new unique constraint (product_id + holding_capacity)
-- Note: We'll make this constraint after migrating data in next migration
-- For now, we allow duplicates during migration

-- Add comment
COMMENT ON COLUMN packaging.product_id IS 'Foreign key to products table - packaging is now product-specific';

