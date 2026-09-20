-- Lot sale lines: optional bag metadata (no hard link to quantity).
-- quantity remains the inventory/billing source of truth.

ALTER TABLE sales_sauda_lines
  ADD COLUMN IF NOT EXISTS no_of_bags INTEGER,
  ADD COLUMN IF NOT EXISTS bag_weight DECIMAL(10, 2);

ALTER TABLE invoice_dispatch_lines
  ADD COLUMN IF NOT EXISTS no_of_bags INTEGER,
  ADD COLUMN IF NOT EXISTS bag_weight DECIMAL(10, 2);

DO $$ BEGIN
  ALTER TABLE sales_sauda_lines
    ADD CONSTRAINT sales_sauda_lines_bags_nonneg_check
    CHECK (
      (no_of_bags IS NULL OR no_of_bags >= 1)
      AND (bag_weight IS NULL OR bag_weight > 0)
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Product lines must not carry lot bag fields; lot lines may.
DO $$ BEGIN
  ALTER TABLE sales_sauda_lines
    DROP CONSTRAINT IF EXISTS sales_sauda_lines_product_or_lot_check;
  ALTER TABLE sales_sauda_lines
    ADD CONSTRAINT sales_sauda_lines_product_or_lot_check
    CHECK (
      (
        line_type = 'product'
        AND product_id IS NOT NULL
        AND lot_id IS NULL
        AND no_of_bags IS NULL
        AND bag_weight IS NULL
      )
      OR (
        line_type = 'lot'
        AND lot_id IS NOT NULL
        AND product_id IS NULL
        AND packaging_id IS NULL
        AND packet_count IS NULL
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN sales_sauda_lines.no_of_bags IS
  'Optional bag count for lot lines; not required to match quantity';
COMMENT ON COLUMN sales_sauda_lines.bag_weight IS
  'Optional kg per bag for lot lines; qty may be set independently';
COMMENT ON COLUMN invoice_dispatch_lines.no_of_bags IS
  'Optional bag count copied/overridden for lot dispatch lines';
COMMENT ON COLUMN invoice_dispatch_lines.bag_weight IS
  'Optional kg per bag for lot dispatch lines';
