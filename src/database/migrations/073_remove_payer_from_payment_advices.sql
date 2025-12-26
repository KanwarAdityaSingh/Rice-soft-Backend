-- Migration: Remove payer_id and make recipient_id optional in payment_advices table
-- Description: Makes payer_id and recipient_id nullable, removing the requirement for both fields

-- Step 1: Drop foreign key constraints (must be done before altering columns)
ALTER TABLE payment_advices
DROP CONSTRAINT IF EXISTS payment_advices_payer_id_fkey;

ALTER TABLE payment_advices
DROP CONSTRAINT IF EXISTS payment_advices_recipient_id_fkey;

-- Step 2: Drop indexes (optional but clean)
DROP INDEX IF EXISTS idx_payment_advices_payer_id;

-- Step 3: Make columns nullable
ALTER TABLE payment_advices
ALTER COLUMN payer_id DROP NOT NULL;

ALTER TABLE payment_advices
ALTER COLUMN recipient_id DROP NOT NULL;

-- Step 4: Add comments for documentation
COMMENT ON COLUMN payment_advices.payer_id IS 'Payer user ID (deprecated - no longer required)';
COMMENT ON COLUMN payment_advices.recipient_id IS 'Recipient vendor ID (optional)';

