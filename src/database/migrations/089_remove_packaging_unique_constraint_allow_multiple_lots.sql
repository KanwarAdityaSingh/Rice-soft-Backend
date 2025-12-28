-- Migration: Remove unique constraint on packaging to allow multiple lots
-- Description: Allows multiple packaging entries with same product_id and holding_capacity for lot tracking

-- Step 1: Drop the unique constraint that prevents multiple lots
ALTER TABLE packaging
DROP CONSTRAINT IF EXISTS packaging_product_id_holding_capacity_key;

-- Step 2: Add comment explaining the change
COMMENT ON TABLE packaging IS 'Stores packaging specifications per product. Multiple entries allowed for same product+capacity to track separate lots. Each entry has unique ID and separate inventory.';

