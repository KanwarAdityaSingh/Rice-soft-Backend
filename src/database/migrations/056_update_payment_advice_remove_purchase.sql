-- Migration: Update payment_advices to link to sauda/ISP instead of purchase
-- Description: Removes purchase_id and adds sauda_id and inward_slip_pass_id to payment_advices

-- Add new columns to payment_advices
ALTER TABLE payment_advices ADD COLUMN IF NOT EXISTS sauda_id UUID REFERENCES saudas(id) ON DELETE SET NULL;
ALTER TABLE payment_advices ADD COLUMN IF NOT EXISTS inward_slip_pass_id UUID REFERENCES inward_slip_passes(id) ON DELETE SET NULL;

-- Add check constraint: at least one of sauda_id or inward_slip_pass_id must be provided
ALTER TABLE payment_advices ADD CONSTRAINT payment_advice_link_check 
  CHECK (sauda_id IS NOT NULL OR inward_slip_pass_id IS NOT NULL);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_payment_advices_sauda_id ON payment_advices(sauda_id);
CREATE INDEX IF NOT EXISTS idx_payment_advices_inward_slip_pass_id ON payment_advices(inward_slip_pass_id);

-- Remove purchase_id column (this will also drop the foreign key constraint)
ALTER TABLE payment_advices DROP COLUMN IF EXISTS purchase_id;

-- Add comments for documentation
COMMENT ON COLUMN payment_advices.sauda_id IS 'Links payment advice to a specific sauda (optional)';
COMMENT ON COLUMN payment_advices.inward_slip_pass_id IS 'Links payment advice to an ISP covering multiple saudas (optional)';
COMMENT ON CONSTRAINT payment_advice_link_check ON payment_advices IS 'Ensures at least one of sauda_id or inward_slip_pass_id is provided';

