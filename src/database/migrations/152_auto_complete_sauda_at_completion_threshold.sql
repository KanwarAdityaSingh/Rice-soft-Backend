-- Migration: Auto-mark sauda completed when completion_percentage >= 95%

CREATE OR REPLACE FUNCTION calculate_sauda_completion_percentage()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.quantity IS NULL OR NEW.quantity = 0 THEN
    NEW.completion_percentage := NULL;
  ELSE
    NEW.completion_percentage := ROUND((NEW.received_until_now / NEW.quantity) * 100, 2);

    IF NEW.completion_percentage >= 95
       AND NEW.status IN ('draft', 'active') THEN
      NEW.status := 'completed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_sauda_completion_percentage() IS
  'Sets completion_percentage from received_until_now/quantity; auto-sets status to completed at >= 95% for draft/active saudas';

-- Backfill saudas already at or above threshold
UPDATE saudas
SET received_until_now = received_until_now
WHERE status IN ('draft', 'active')
  AND quantity IS NOT NULL
  AND quantity > 0
  AND completion_percentage >= 95;
