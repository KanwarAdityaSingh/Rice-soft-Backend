-- Migration: Add bill_number to payment_advices table
-- Description: Adds bill_number column to store purchase bill number from ISP

-- Add bill_number column
ALTER TABLE payment_advices
ADD COLUMN IF NOT EXISTS bill_number VARCHAR(255);

-- Create index for bill_number for better query performance
CREATE INDEX IF NOT EXISTS idx_payment_advices_bill_number ON payment_advices(bill_number) WHERE bill_number IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN payment_advices.bill_number IS 'Purchase bill number from ISP';

