-- Migration: Add 'weight' option to broker_commission_type
-- This allows broker commission to be calculated based on total weight (commission per unit weight)

-- Drop existing check constraints and add new ones with 'weight' option

-- For saudas table
ALTER TABLE saudas DROP CONSTRAINT IF EXISTS saudas_broker_commission_type_check;
ALTER TABLE saudas ADD CONSTRAINT saudas_broker_commission_type_check 
  CHECK (broker_commission_type IN ('rupees', 'percentage', 'weight'));

-- For purchases table  
ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_broker_commission_type_check;
ALTER TABLE purchases ADD CONSTRAINT purchases_broker_commission_type_check 
  CHECK (broker_commission_type IN ('rupees', 'percentage', 'weight'));

-- Update comments
COMMENT ON COLUMN saudas.broker_commission_type IS 'Type of broker commission: rupees (fixed amount), percentage, or weight (per unit weight)';
COMMENT ON COLUMN purchases.broker_commission_type IS 'Type of broker commission: rupees (fixed amount), percentage, or weight (per unit weight)';
