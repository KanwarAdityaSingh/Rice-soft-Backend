-- Migration: Add dana_deduction to payment_advices table
-- Description: Adds dana_deduction field for Dana deduction calculation. final_weight will be calculated as kaanta_weight - dana_deduction

-- Remove net_weight column if it exists (replaced by final_weight)
ALTER TABLE payment_advices
DROP COLUMN IF EXISTS net_weight;

-- Add dana_deduction column
ALTER TABLE payment_advices
ADD COLUMN IF NOT EXISTS dana_deduction DECIMAL(10,2);

-- Add comment for documentation
COMMENT ON COLUMN payment_advices.dana_deduction IS 'Dana deduction amount: (said_sent_weight * 300/1000)/100. Deduction of 300gm per quintal.';
COMMENT ON COLUMN payment_advices.final_weight IS 'Final weight after Dana deduction: kaanta_weight - dana_deduction. This is the weight used for all calculations.';

