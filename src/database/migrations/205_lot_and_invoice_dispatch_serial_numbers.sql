-- Migration: sequential serial_number on lots and invoice dispatches
-- Rules (same idea as ISP slip numbers):
--   - Backfill ascending by created_at
--   - New rows get the lowest unused positive integer (reuses gaps after tip delete)
--   - App enforces: delete only when no higher serial exists

-- =====================================================
-- 1. inward_slip_lots.serial_number
-- =====================================================

ALTER TABLE inward_slip_lots
  ADD COLUMN IF NOT EXISTS serial_number INTEGER;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS rn
  FROM inward_slip_lots
  WHERE serial_number IS NULL
)
UPDATE inward_slip_lots l
SET serial_number = o.rn
FROM ordered o
WHERE l.id = o.id
  AND l.serial_number IS NULL;

ALTER TABLE inward_slip_lots
  ALTER COLUMN serial_number SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE inward_slip_lots
    ADD CONSTRAINT inward_slip_lots_serial_number_unique UNIQUE (serial_number);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_inward_slip_lots_serial_number
  ON inward_slip_lots (serial_number);

COMMENT ON COLUMN inward_slip_lots.serial_number IS
  'Global ascending serial; lowest unused assigned on insert; only tip may be deleted';

CREATE OR REPLACE FUNCTION assign_inward_slip_lot_serial_number()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  IF NEW.serial_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Serialize assignment under concurrency
  PERFORM pg_advisory_xact_lock(872344021);

  WITH used AS (
    SELECT serial_number AS n FROM inward_slip_lots WHERE serial_number IS NOT NULL
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

DROP TRIGGER IF EXISTS trg_assign_inward_slip_lot_serial_number ON inward_slip_lots;
CREATE TRIGGER trg_assign_inward_slip_lot_serial_number
  BEFORE INSERT ON inward_slip_lots
  FOR EACH ROW
  EXECUTE FUNCTION assign_inward_slip_lot_serial_number();

-- =====================================================
-- 2. invoice_dispatches.serial_number
-- =====================================================

ALTER TABLE invoice_dispatches
  ADD COLUMN IF NOT EXISTS serial_number INTEGER;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS rn
  FROM invoice_dispatches
  WHERE serial_number IS NULL
)
UPDATE invoice_dispatches d
SET serial_number = o.rn
FROM ordered o
WHERE d.id = o.id
  AND d.serial_number IS NULL;

ALTER TABLE invoice_dispatches
  ALTER COLUMN serial_number SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE invoice_dispatches
    ADD CONSTRAINT invoice_dispatches_serial_number_unique UNIQUE (serial_number);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_invoice_dispatches_serial_number
  ON invoice_dispatches (serial_number);

COMMENT ON COLUMN invoice_dispatches.serial_number IS
  'Global ascending serial; lowest unused assigned on insert; only tip may be deleted';

CREATE OR REPLACE FUNCTION assign_invoice_dispatch_serial_number()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  IF NEW.serial_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(872344022);

  WITH used AS (
    SELECT serial_number AS n FROM invoice_dispatches WHERE serial_number IS NOT NULL
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

DROP TRIGGER IF EXISTS trg_assign_invoice_dispatch_serial_number ON invoice_dispatches;
CREATE TRIGGER trg_assign_invoice_dispatch_serial_number
  BEFORE INSERT ON invoice_dispatches
  FOR EACH ROW
  EXECUTE FUNCTION assign_invoice_dispatch_serial_number();
