-- Migration: Update batch_status_enum and make product_id/packaging_id nullable in batches
-- Description: Adds new status values and makes product_id/packaging_id nullable for three-stage workflow

-- Step 1: Update batch_status_enum to include new statuses
DO $$ 
BEGIN
    -- Add new enum values if they don't exist
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'recipe_attached' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'batch_status_enum')) THEN
        ALTER TYPE batch_status_enum ADD VALUE 'recipe_attached';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'ready_to_pack' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'batch_status_enum')) THEN
        ALTER TYPE batch_status_enum ADD VALUE 'ready_to_pack';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'packaged' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'batch_status_enum')) THEN
        ALTER TYPE batch_status_enum ADD VALUE 'packaged';
    END IF;
END $$;

-- Step 2: Make product_id nullable in batches table
ALTER TABLE batches
ALTER COLUMN product_id DROP NOT NULL;

-- Step 3: Make packaging_id nullable in batches table
ALTER TABLE batches
ALTER COLUMN packaging_id DROP NOT NULL;

-- Step 4: Update CHECK constraint for status to include new values
ALTER TABLE batches
DROP CONSTRAINT IF EXISTS batches_status_check;

ALTER TABLE batches
ADD CONSTRAINT batches_status_check 
CHECK (status IN ('planned', 'in_progress', 'recipe_attached', 'ready_to_pack', 'packaged', 'completed', 'cancelled'));

-- Step 5: Update default status to 'planned' (or 'recipe_attached' if preferred)
-- Keeping 'planned' as default for backward compatibility

-- Step 6: Add comments
COMMENT ON COLUMN batches.product_id IS 'Product ID (nullable for three-stage workflow - set in stage 2)';
COMMENT ON COLUMN batches.packaging_id IS 'Packaging ID (nullable for three-stage workflow - set in stage 3, kept for backward compatibility)';
COMMENT ON COLUMN batches.status IS 'Batch status: planned, in_progress, recipe_attached, ready_to_pack, packaged, completed, cancelled';

