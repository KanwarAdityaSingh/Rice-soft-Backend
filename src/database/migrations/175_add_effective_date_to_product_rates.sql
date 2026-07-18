-- Rate entries carry a business effective_date (when the rate applies).
-- History is one row per (product, capacity, effective_date); current product_rates
-- follows the latest effective_date.

ALTER TABLE product_rate_history
  ADD COLUMN IF NOT EXISTS effective_date DATE;

UPDATE product_rate_history
SET effective_date = (created_at AT TIME ZONE 'Asia/Kolkata')::date
WHERE effective_date IS NULL;

-- Multiple history rows can share the same calendar day after backfill.
-- Keep the latest row per (product, capacity, effective_date); drop older duplicates.
DELETE FROM product_rate_history
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY product_id, holding_capacity, effective_date
        ORDER BY created_at DESC, id DESC
      ) AS rn
    FROM product_rate_history
  ) ranked
  WHERE ranked.rn > 1
);

ALTER TABLE product_rate_history
  ALTER COLUMN effective_date SET NOT NULL;

-- One rate observation per product + capacity + day
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_rate_history_product_capacity_date
  ON product_rate_history (product_id, holding_capacity, effective_date);

CREATE INDEX IF NOT EXISTS idx_product_rate_history_product_capacity_eff
  ON product_rate_history (product_id, holding_capacity, effective_date DESC);

CREATE INDEX IF NOT EXISTS idx_product_rate_history_product_eff
  ON product_rate_history (product_id, effective_date DESC);

COMMENT ON COLUMN product_rate_history.effective_date IS
  'Business date the rate applies to (user-selected when saving rates)';

ALTER TABLE product_rates
  ADD COLUMN IF NOT EXISTS effective_date DATE;

-- Seed current rates' effective_date from latest history row per capacity
UPDATE product_rates pr
SET effective_date = src.effective_date
FROM (
  SELECT DISTINCT ON (product_id, holding_capacity)
    product_id,
    holding_capacity,
    effective_date
  FROM product_rate_history
  ORDER BY product_id, holding_capacity, effective_date DESC, created_at DESC
) src
WHERE pr.product_id = src.product_id
  AND pr.holding_capacity = src.holding_capacity
  AND pr.effective_date IS NULL;

UPDATE product_rates
SET effective_date = (COALESCE(updated_at, created_at) AT TIME ZONE 'Asia/Kolkata')::date
WHERE effective_date IS NULL;

ALTER TABLE product_rates
  ALTER COLUMN effective_date SET NOT NULL;

COMMENT ON COLUMN product_rates.effective_date IS
  'Effective date of the current suggested rate (latest history date for this capacity)';
