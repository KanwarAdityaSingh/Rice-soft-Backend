-- Migration: Update products table - remove packet_type requirement, add rice_type, drop product_recipes table
-- Description: Removes packet_type from products, adds rice_type field, and drops the product_recipes junction table

-- Step 1: Ensure rice_type_enum exists (should already exist from migration 009)
DO $$ BEGIN
    CREATE TYPE rice_type_enum AS ENUM ('basmati', 'non_basmati', 'parboiled', 'raw', 'raw_basmati', 'steam_basmati', 'white_sella', 'golden_sella');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Step 2: Add rice_type column to products table (nullable initially for migration)
ALTER TABLE products
ADD COLUMN IF NOT EXISTS rice_type rice_type_enum;

-- Step 3: Drop product_recipes junction table (remove recipe-product relationship)
DROP TABLE IF EXISTS product_recipes CASCADE;

-- Step 4: Add comment
COMMENT ON COLUMN products.rice_type IS 'Type of rice for this product: basmati, non_basmati, parboiled, raw, raw_basmati, steam_basmati, white_sella, golden_sella';

-- Note: packet_type was never a column in products table, it was only in CreateProductDTO
-- The actual packet_type is stored in packaging table, so no column needs to be dropped

