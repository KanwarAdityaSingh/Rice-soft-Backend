-- Migration: Add is_dana_required column to saudas table
-- Description: Adds is_dana_required field to control whether dana deduction should be calculated in payment advice

-- Add is_dana_required column as nullable with default value of false
ALTER TABLE saudas
ADD COLUMN IF NOT EXISTS is_dana_required BOOLEAN DEFAULT false;

-- Update existing records to set is_dana_required = false (explicitly set for existing records)
UPDATE saudas
SET is_dana_required = false
WHERE is_dana_required IS NULL;

-- Create index for better query performance (only on non-null values)
CREATE INDEX IF NOT EXISTS idx_saudas_is_dana_required ON saudas(is_dana_required) WHERE is_dana_required IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN saudas.is_dana_required IS 'Controls whether dana deduction (300gm per quintal) should be calculated in payment advice. NULL and false both mean dana is not required. Default: false';

