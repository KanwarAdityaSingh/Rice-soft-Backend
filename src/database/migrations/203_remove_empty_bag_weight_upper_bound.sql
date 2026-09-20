-- Migration 203: Remove empty_bag_weight_kg upper bound (≤9.999) on purchases.
-- Legacy packaging snapshots may store weights above that (e.g. 100 kg test/mis-entry).

ALTER TABLE packaging_material_purchases
  ALTER COLUMN empty_bag_weight_kg TYPE DECIMAL(15, 4);

ALTER TABLE packaging_material_purchases
  DROP CONSTRAINT IF EXISTS packaging_material_purchases_empty_bag_weight_kg_check;

ALTER TABLE packaging_material_purchases
  ADD CONSTRAINT packaging_material_purchases_empty_bag_weight_kg_check
  CHECK (empty_bag_weight_kg > 0);

-- Backfill legacy packaging snapshots previously skipped by the 9.999 cap
INSERT INTO packaging_material_purchases (
  vendor_id,
  packaging_id,
  purchase_date,
  invoice_number,
  invoice_date,
  quantity_kg,
  empty_bag_weight_kg,
  rate_per_kg,
  gst_percent,
  bag_count,
  rate_per_bag,
  taxable_amount,
  gst_amount,
  total_amount,
  godown_id,
  invoice_document_url,
  notes,
  created_by
)
SELECT
  p.packaging_vendor_id,
  p.id,
  COALESCE(p.bill_date, p.created_at::date),
  COALESCE(
    NULLIF(TRIM(p.bill_number), ''),
    'LEGACY-' || REPLACE(p.id::text, '-', '')
  ),
  COALESCE(p.bill_date, p.created_at::date),
  COALESCE(p.empty_bags_total_weight_kg, p.empty_bag_weight_kg),
  p.empty_bag_weight_kg,
  p.empty_bag_rate_per_kg,
  COALESCE(p.empty_bag_gst_percent, 0),
  GREATEST(
    1,
    COALESCE(
      (
        SELECT SUM(pi.available_quantity)::INT
        FROM packets_inventory pi
        WHERE pi.packaging_id = p.id
      ),
      CASE
        WHEN p.empty_bag_weight_kg > 0 AND p.empty_bags_total_weight_kg IS NOT NULL
          THEN GREATEST(1, ROUND(p.empty_bags_total_weight_kg / p.empty_bag_weight_kg)::INT)
        ELSE 1
      END
    )
  ),
  ROUND(
    (
      (p.empty_bag_rate_per_kg + (p.empty_bag_rate_per_kg * COALESCE(p.empty_bag_gst_percent, 0) / 100.0))
      * p.empty_bag_weight_kg
    )::numeric,
    4
  ),
  COALESCE(p.empty_bags_taxable_amount, ROUND((p.empty_bags_total_weight_kg * p.empty_bag_rate_per_kg)::numeric, 2)),
  COALESCE(p.empty_bags_gst_amount, 0),
  COALESCE(p.empty_bags_total_amount, ROUND((p.empty_bags_total_weight_kg * p.empty_bag_rate_per_kg)::numeric, 2)),
  COALESCE(
    (
      SELECT pi.godown_id
      FROM packets_inventory pi
      WHERE pi.packaging_id = p.id
      ORDER BY pi.available_quantity DESC
      LIMIT 1
    ),
    (SELECT id FROM godowns ORDER BY created_at ASC LIMIT 1)
  ),
  p.packaging_bill_url,
  'Migrated from packaging empty-bag snapshot (post 9.999 cap removal)',
  p.created_by
FROM packaging p
WHERE p.packaging_vendor_id IS NOT NULL
  AND p.empty_bag_weight_kg IS NOT NULL
  AND p.empty_bag_rate_per_kg IS NOT NULL
  AND p.empty_bag_weight_kg > 0
  AND p.empty_bag_rate_per_kg > 0
  AND COALESCE(p.empty_bags_total_weight_kg, p.empty_bag_weight_kg) > 0
  AND NOT EXISTS (
    SELECT 1 FROM packaging_material_purchases x WHERE x.packaging_id = p.id
  )
  AND EXISTS (SELECT 1 FROM godowns LIMIT 1);
