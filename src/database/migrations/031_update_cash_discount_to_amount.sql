-- Migration: Update cash_discount to store amount instead of percentage
-- Description: Changes cash_discount from percentage to fixed amount

-- Update cash_discount column to DECIMAL(15,2) to store amount (was DECIMAL(5,2) for percentage)
ALTER TABLE saudas 
ALTER COLUMN cash_discount TYPE DECIMAL(15,2);

-- Update comment to reflect it's an amount, not percentage
COMMENT ON COLUMN saudas.cash_discount IS 'Cash discount amount (fixed amount to be subtracted from base amount)';

