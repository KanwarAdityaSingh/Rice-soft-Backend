-- Migration: Migrate existing packaging data
-- Description: Creates a default/legacy product and assigns existing packaging to it

-- Step 1: Create a default/legacy product for existing packaging
INSERT INTO products (id, name, description, brand, created_at, updated_at)
SELECT 
    gen_random_uuid() as id,
    'Legacy Product' as name,
    'Default product for packaging created before product-specific packaging system' as description,
    NULL as brand,
    CURRENT_TIMESTAMP as created_at,
    CURRENT_TIMESTAMP as updated_at
WHERE NOT EXISTS (
    SELECT 1 FROM products WHERE name = 'Legacy Product'
)
ON CONFLICT DO NOTHING;

-- Step 2: Assign all existing packaging to the legacy product
UPDATE packaging
SET product_id = (
    SELECT id FROM products WHERE name = 'Legacy Product' LIMIT 1
)
WHERE product_id IS NULL;

-- Step 3: Make product_id NOT NULL
ALTER TABLE packaging
ALTER COLUMN product_id SET NOT NULL;

-- Step 4: Add unique constraint (product_id + holding_capacity)
-- This ensures one packaging entry per product per weight
ALTER TABLE packaging
ADD CONSTRAINT packaging_product_id_holding_capacity_key 
UNIQUE (product_id, holding_capacity);

-- Add comment
COMMENT ON TABLE packaging IS 'Stores packaging specifications per product (source of truth: product_id + holding_capacity)';

