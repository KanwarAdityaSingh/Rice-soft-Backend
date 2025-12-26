-- Migration: Make recipient_id nullable in payment_advices table
-- Description: Makes recipient_id nullable, removing the requirement for recipient in payment advice

-- Step 1: Drop foreign key constraint for recipient_id (must be done before altering column)
ALTER TABLE payment_advices
DROP CONSTRAINT IF EXISTS payment_advices_recipient_id_fkey;

-- Step 2: Make recipient_id nullable
ALTER TABLE payment_advices
ALTER COLUMN recipient_id DROP NOT NULL;

-- Step 3: Add comment for documentation
COMMENT ON COLUMN payment_advices.recipient_id IS 'Recipient vendor ID (optional)';

