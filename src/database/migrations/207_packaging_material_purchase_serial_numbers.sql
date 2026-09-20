-- Migration: sequential serial_number on packaging_material_purchases
-- Same rules as lots (global):
--   - Backfill ascending by created_at
--   - New rows get the lowest unused positive integer (reuses gaps after tip delete)
--   - App enforces: delete only when no higher serial exists

ALTER TABLE packaging_material_purchases
  ADD COLUMN IF NOT EXISTS serial_number INTEGER;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS rn
  FROM packaging_material_purchases
  WHERE serial_number IS NULL
)
UPDATE packaging_material_purchases p
SET serial_number = o.rn
FROM ordered o
WHERE p.id = o.id
  AND p.serial_number IS NULL;

ALTER TABLE packaging_material_purchases
  ALTER COLUMN serial_number SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE packaging_material_purchases
    ADD CONSTRAINT packaging_material_purchases_serial_number_unique UNIQUE (serial_number);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_packaging_material_purchases_serial_number
  ON packaging_material_purchases (serial_number);

COMMENT ON COLUMN packaging_material_purchases.serial_number IS
  'Global ascending serial; lowest unused assigned on insert; only tip may be deleted';

CREATE OR REPLACE FUNCTION assign_packaging_material_purchase_serial_number()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  IF NEW.serial_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Serialize assignment under concurrency
  PERFORM pg_advisory_xact_lock(872344023);

  WITH used AS (
    SELECT serial_number AS n FROM packaging_material_purchases WHERE serial_number IS NOT NULL
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

DROP TRIGGER IF EXISTS trg_assign_packaging_material_purchase_serial_number
  ON packaging_material_purchases;
CREATE TRIGGER trg_assign_packaging_material_purchase_serial_number
  BEFORE INSERT ON packaging_material_purchases
  FOR EACH ROW
  EXECUTE FUNCTION assign_packaging_material_purchase_serial_number();
