-- Migration: Scope invoice_dispatch serial_number per godown + financial year
-- Each (godown_id, financial_year) has its own 1,2,3… sequence (gap reuse / tip-only delete).

ALTER TABLE invoice_dispatches
  DROP CONSTRAINT IF EXISTS invoice_dispatches_serial_number_unique;

-- Re-number within each godown + FY (ascending by created_at)
WITH ordered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY godown_id, financial_year
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM invoice_dispatches
)
UPDATE invoice_dispatches d
SET serial_number = o.rn
FROM ordered o
WHERE d.id = o.id;

DO $$ BEGIN
  ALTER TABLE invoice_dispatches
    ADD CONSTRAINT invoice_dispatches_godown_fy_serial_unique
    UNIQUE (godown_id, financial_year, serial_number);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DROP INDEX IF EXISTS idx_invoice_dispatches_serial_number;
CREATE INDEX IF NOT EXISTS idx_invoice_dispatches_godown_fy_serial
  ON invoice_dispatches (godown_id, financial_year, serial_number);

COMMENT ON COLUMN invoice_dispatches.serial_number IS
  'Ascending serial within godown_id + financial_year; lowest unused on insert; only tip in that scope may be deleted';

CREATE OR REPLACE FUNCTION assign_invoice_dispatch_serial_number()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  IF NEW.serial_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.godown_id IS NULL OR NEW.financial_year IS NULL OR TRIM(NEW.financial_year) = '' THEN
    RAISE EXCEPTION 'godown_id and financial_year are required to assign invoice dispatch serial_number';
  END IF;

  -- Serialize assignment per godown + FY
  PERFORM pg_advisory_xact_lock(
    872344022,
    hashtext(NEW.godown_id::text || ':' || NEW.financial_year)
  );

  WITH used AS (
    SELECT serial_number AS n
    FROM invoice_dispatches
    WHERE godown_id = NEW.godown_id
      AND financial_year = NEW.financial_year
      AND serial_number IS NOT NULL
  ),
  bound AS (
    SELECT COALESCE((SELECT MAX(n) FROM used), 0) + 1 AS upper
  )
  SELECT MIN(gs.i)
  INTO next_num
  FROM bound b
  CROSS JOIN generate_series(1, b.upper) AS gs(i)
  WHERE NOT EXISTS (SELECT 1 FROM used WHERE used.n = gs.i);

  IF next_num IS NULL THEN
    next_num := 1;
  END IF;

  NEW.serial_number := next_num;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
