-- Migration: Add broker_commission_type column to saudas and purchases tables
-- This allows broker commission to be specified as either rupees (fixed amount) or percentage

-- Add broker_commission_type column to saudas table
ALTER TABLE saudas 
ADD COLUMN IF NOT EXISTS broker_commission_type VARCHAR(20) NOT NULL DEFAULT 'percentage' 
CHECK (broker_commission_type IN ('rupees', 'percentage'));

-- Add broker_commission_type column to purchases table
ALTER TABLE purchases 
ADD COLUMN IF NOT EXISTS broker_commission_type VARCHAR(20) NOT NULL DEFAULT 'percentage' 
CHECK (broker_commission_type IN ('rupees', 'percentage'));

-- Add comments
COMMENT ON COLUMN saudas.broker_commission_type IS 'Type of broker commission: rupees (fixed amount) or percentage (default)';
COMMENT ON COLUMN purchases.broker_commission_type IS 'Type of broker commission: rupees (fixed amount) or percentage (default)';

-- Update existing records to have 'percentage' as default (already handled by DEFAULT)
-- This maintains backward compatibility as broker_commission was previously always treated as percentage

