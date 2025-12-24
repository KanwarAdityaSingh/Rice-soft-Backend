-- Migration: Add received weight tracking to saudas
-- Description: Adds received_until_now and completion_percentage columns to track cumulative received weight and completion status

-- =====================================================
-- STEP 1: Add new columns to saudas table
-- =====================================================

-- Add received_until_now column (cumulative weight received from all kaantas)
ALTER TABLE saudas
ADD COLUMN IF NOT EXISTS received_until_now DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Add completion_percentage column (calculated: received_until_now / quantity * 100)
-- Using DECIMAL(10,2) to allow for percentages over 100% (e.g., if more weight received than expected)
ALTER TABLE saudas
ADD COLUMN IF NOT EXISTS completion_percentage DECIMAL(10,2);

-- If column already exists with wrong precision, alter it
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'saudas' 
    AND column_name = 'completion_percentage'
    AND data_type = 'numeric'
    AND numeric_precision = 5
  ) THEN
    ALTER TABLE saudas ALTER COLUMN completion_percentage TYPE DECIMAL(10,2);
  END IF;
END $$;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_saudas_received_until_now ON saudas(received_until_now);

-- Add comments for documentation
COMMENT ON COLUMN saudas.received_until_now IS 'Cumulative weight received from all kaantas linked to this sauda';
COMMENT ON COLUMN saudas.completion_percentage IS 'Percentage of completion: (received_until_now / quantity) * 100. NULL if quantity is NULL or 0';

-- =====================================================
-- STEP 2: Create function to calculate completion percentage
-- =====================================================

CREATE OR REPLACE FUNCTION calculate_sauda_completion_percentage()
RETURNS TRIGGER AS $$
BEGIN
  -- If quantity is NULL or 0, set completion_percentage to NULL
  IF NEW.quantity IS NULL OR NEW.quantity = 0 THEN
    NEW.completion_percentage := NULL;
  ELSE
    -- Calculate percentage: (received_until_now / quantity) * 100, rounded to 2 decimal places
    NEW.completion_percentage := ROUND((NEW.received_until_now / NEW.quantity) * 100, 2);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- STEP 3: Create trigger to auto-calculate completion_percentage
-- =====================================================

CREATE TRIGGER update_sauda_completion_percentage
  BEFORE INSERT OR UPDATE OF received_until_now, quantity ON saudas
  FOR EACH ROW
  EXECUTE FUNCTION calculate_sauda_completion_percentage();

-- =====================================================
-- STEP 4: Migrate existing data
-- =====================================================

-- Calculate received_until_now for existing saudas from their kaantas
UPDATE saudas s
SET received_until_now = COALESCE((
  SELECT SUM(COALESCE(k.kaanta_weight, 0))
  FROM kaantas k
  WHERE k.sauda_id = s.id
), 0);

-- Trigger will automatically calculate completion_percentage for all rows
-- Force trigger execution by updating the rows
UPDATE saudas
SET received_until_now = received_until_now
WHERE received_until_now IS NOT NULL;

