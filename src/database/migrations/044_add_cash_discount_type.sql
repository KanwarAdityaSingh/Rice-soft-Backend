-- Migration: Add cash_discount_type column to saudas and purchases tables
-- This allows cash discount to be specified as either rupees (fixed amount) or percentage

-- Add cash_discount_type column to saudas table
ALTER TABLE saudas 
ADD COLUMN IF NOT EXISTS cash_discount_type VARCHAR(20) NOT NULL DEFAULT 'rupees' 
CHECK (cash_discount_type IN ('rupees', 'percentage'));

-- Add cash_discount_type column to purchases table
ALTER TABLE purchases 
ADD COLUMN IF NOT EXISTS cash_discount_type VARCHAR(20) NOT NULL DEFAULT 'rupees' 
CHECK (cash_discount_type IN ('rupees', 'percentage'));

-- Add comments
COMMENT ON COLUMN saudas.cash_discount_type IS 'Type of cash discount: rupees (fixed amount) or percentage';
COMMENT ON COLUMN purchases.cash_discount_type IS 'Type of cash discount: rupees (fixed amount) or percentage';

-- Update existing records to have 'rupees' as default (already handled by DEFAULT)

