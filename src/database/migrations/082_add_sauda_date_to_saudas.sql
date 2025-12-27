-- Migration: Add sauda_date to saudas table
-- Description: Adds sauda_date column to store the date of the sauda transaction

-- Add sauda_date column
ALTER TABLE saudas
ADD COLUMN IF NOT EXISTS sauda_date DATE;

-- Add comment for documentation
COMMENT ON COLUMN saudas.sauda_date IS 'Date of the sauda transaction';

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_saudas_sauda_date ON saudas(sauda_date);

