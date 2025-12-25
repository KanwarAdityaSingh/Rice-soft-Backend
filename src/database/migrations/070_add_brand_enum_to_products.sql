-- Migration: Add brand enum to products table
-- Description: Creates brand_enum type and updates products table to use it

-- =====================================================
-- STEP 1: Create brand_enum type
-- =====================================================

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'brand_enum') THEN
        CREATE TYPE brand_enum AS ENUM ('Tamara', 'Hariom');
    END IF;
END $$;

-- Add comment
COMMENT ON TYPE brand_enum IS 'Enum for product brands: Tamara and Hariom';

-- =====================================================
-- STEP 2: Update products table to use brand_enum
-- =====================================================

-- First, update any existing brand values that don't match enum values to NULL
UPDATE products 
SET brand = NULL 
WHERE brand IS NOT NULL 
  AND brand NOT IN ('Tamara', 'Hariom');

-- Then alter the column type
ALTER TABLE products 
    ALTER COLUMN brand TYPE brand_enum USING 
        CASE 
            WHEN brand = 'Tamara' THEN 'Tamara'::brand_enum
            WHEN brand = 'Hariom' THEN 'Hariom'::brand_enum
            ELSE NULL
        END;

-- Add comment
COMMENT ON COLUMN products.brand IS 'Product brand - must be one of: Tamara, Hariom';

