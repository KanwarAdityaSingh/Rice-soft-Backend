-- Migration: Make is_dana_required nullable in saudas table
-- Description: Allows NULL values for is_dana_required field. NULL and false both mean dana is not required.

-- 1. Drop the NOT NULL constraint if it exists (in case column was created with NOT NULL)
ALTER TABLE saudas
ALTER COLUMN is_dana_required DROP NOT NULL;

-- 2. Ensure default is set to false (for new records)
ALTER TABLE saudas
ALTER COLUMN is_dana_required SET DEFAULT false;

-- 3. Drop existing index if it's not partial
DROP INDEX IF EXISTS idx_saudas_is_dana_required;

-- 4. Recreate index as partial (only on non-null values for better performance)
CREATE INDEX idx_saudas_is_dana_required ON saudas(is_dana_required) 
WHERE is_dana_required IS NOT NULL;

-- 5. Update comment to clarify NULL behavior
COMMENT ON COLUMN saudas.is_dana_required IS 'Controls whether dana deduction (300gm per quintal) should be calculated in payment advice. NULL and false both mean dana is not required. Only true means dana deduction should be applied. Default: false';

