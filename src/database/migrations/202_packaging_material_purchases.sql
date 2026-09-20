-- Migration 202: Packaging material purchases transaction + legacy snapshot migration
-- Inventory updates go through purchases; packaging master no longer owns purchase financials.

CREATE TABLE IF NOT EXISTS packaging_material_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES packaging_vendors(id),
  packaging_id UUID NOT NULL REFERENCES packaging(id),
  purchase_date DATE NOT NULL,
  invoice_number VARCHAR(50) NOT NULL,
  invoice_date DATE NOT NULL,
  quantity_kg DECIMAL(13, 3) NOT NULL CHECK (quantity_kg > 0),
  empty_bag_weight_kg DECIMAL(15, 4) NOT NULL CHECK (empty_bag_weight_kg > 0),
  gsm DECIMAL(6, 2) NULL CHECK (gsm IS NULL OR (gsm >= 20 AND gsm <= 500)),
  rate_per_kg DECIMAL(14, 2) NOT NULL CHECK (rate_per_kg > 0),
  gst_percent DECIMAL(5, 2) NOT NULL DEFAULT 0 CHECK (gst_percent >= 0 AND gst_percent <= 100),
  bag_count INT NOT NULL CHECK (bag_count > 0),
  rate_per_bag DECIMAL(14, 4) NOT NULL,
  taxable_amount DECIMAL(14, 2) NOT NULL,
  gst_amount DECIMAL(14, 2) NOT NULL,
  total_amount DECIMAL(14, 2) NOT NULL,
  godown_id UUID NOT NULL REFERENCES godowns(id),
  batch_lot_number VARCHAR(100) NULL,
  invoice_document_url TEXT NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by UUID NULL,
  updated_by UUID NULL,
  CONSTRAINT packaging_material_purchases_vendor_invoice_unique
    UNIQUE (vendor_id, invoice_number),
  CONSTRAINT packaging_material_purchases_invoice_not_after_purchase
    CHECK (invoice_date <= purchase_date)
);

CREATE INDEX IF NOT EXISTS idx_pkg_mat_purchases_packaging_id
  ON packaging_material_purchases (packaging_id);
CREATE INDEX IF NOT EXISTS idx_pkg_mat_purchases_vendor_id
  ON packaging_material_purchases (vendor_id);
CREATE INDEX IF NOT EXISTS idx_pkg_mat_purchases_purchase_date
  ON packaging_material_purchases (purchase_date DESC);
CREATE INDEX IF NOT EXISTS idx_pkg_mat_purchases_godown_id
  ON packaging_material_purchases (godown_id);

COMMENT ON TABLE packaging_material_purchases IS
  'Purchase transaction for empty packaging materials (variable attributes per receipt)';

-- Migrate legacy empty-bag snapshots into synthetic purchase rows (no stock double-count).
-- Only rows that have purchase costing fields; bag_count inferred from packets_inventory sum when possible.
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
  'Migrated from packaging empty-bag snapshot',
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
