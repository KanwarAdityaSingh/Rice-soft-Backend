-- Migration: Add bill_number and bill_date to inward_slip_passes table
-- Description: Adds bill_number and bill_date columns to store purchase bill information

-- Add bill_number column
ALTER TABLE inward_slip_passes
ADD COLUMN IF NOT EXISTS bill_number VARCHAR(255);

-- Add bill_date column
ALTER TABLE inward_slip_passes
ADD COLUMN IF NOT EXISTS bill_date DATE;

-- Create index for bill_number for better query performance
CREATE INDEX IF NOT EXISTS idx_inward_slip_passes_bill_number ON inward_slip_passes(bill_number) WHERE bill_number IS NOT NULL;

-- Create index for bill_date for better query performance
CREATE INDEX IF NOT EXISTS idx_inward_slip_passes_bill_date ON inward_slip_passes(bill_date) WHERE bill_date IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN inward_slip_passes.bill_number IS 'Purchase bill number';
COMMENT ON COLUMN inward_slip_passes.bill_date IS 'Purchase bill date';

