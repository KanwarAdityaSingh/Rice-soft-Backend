-- Migration 201: Product & Packaging master foundations (additive, sales-safe)
-- Brands table, packaging materials, product extensions, packaging material FK.
-- Keeps legacy products.brand, products.rice_type, packaging.packet_type / empty_bag_* columns.

-- =====================================================
-- 1. Brands master
-- =====================================================
CREATE TABLE IF NOT EXISTS brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  code_prefix VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by UUID NULL,
  updated_by UUID NULL,
  CONSTRAINT brands_name_unique UNIQUE (name),
  CONSTRAINT brands_code_prefix_unique UNIQUE (code_prefix)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_brands_name_lower ON brands (LOWER(name));

INSERT INTO brands (name, code_prefix, status)
VALUES
  ('Tamara', 'TAMARA', 'inactive'),
  ('Hariom', 'HARIOM', 'active'),
  ('Postman', 'POST', 'active'),
  ('Jyoti', 'JYOTI', 'inactive'),
  ('Dubar', 'DUBAR', 'inactive'),
  ('Tamaal', 'TAMAAL', 'active')
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- 2. Per-brand product code sequences
-- =====================================================
CREATE TABLE IF NOT EXISTS brand_product_sequences (
  brand_id UUID PRIMARY KEY REFERENCES brands(id) ON DELETE CASCADE,
  next_number INT NOT NULL DEFAULT 1 CHECK (next_number >= 1)
);

INSERT INTO brand_product_sequences (brand_id, next_number)
SELECT id, 1 FROM brands
ON CONFLICT (brand_id) DO NOTHING;

-- =====================================================
-- 3. Packaging materials master
-- =====================================================
CREATE TABLE IF NOT EXISTS packaging_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by UUID NULL,
  updated_by UUID NULL,
  CONSTRAINT packaging_materials_name_unique UNIQUE (name)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_packaging_materials_name_lower
  ON packaging_materials (LOWER(name));

INSERT INTO packaging_materials (name, status)
VALUES
  ('PP Woven Bag', 'active'),
  ('BOPP Laminated Bag', 'active'),
  ('Jute Bag', 'active'),
  ('Laminated Bag', 'active'),
  ('PP Bag', 'active')
ON CONFLICT (name) DO NOTHING;

-- Seed any distinct free-text packet_type values still in packaging
INSERT INTO packaging_materials (name, status)
SELECT DISTINCT TRIM(p.packet_type), 'active'
FROM packaging p
WHERE p.packet_type IS NOT NULL
  AND TRIM(p.packet_type) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM packaging_materials pm
    WHERE LOWER(pm.name) = LOWER(TRIM(p.packet_type))
  );

-- =====================================================
-- 4. Extend products (additive)
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_status_enum') THEN
    CREATE TYPE product_status_enum AS ENUM ('active', 'inactive', 'discontinued');
  END IF;
END $$;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id),
  ADD COLUMN IF NOT EXISTS rice_category rice_code_category_enum,
  ADD COLUMN IF NOT EXISTS product_code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS status product_status_enum NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS bag_image_url TEXT;

-- Backfill brand_id from legacy enum
UPDATE products p
SET brand_id = b.id
FROM brands b
WHERE p.brand_id IS NULL
  AND p.brand IS NOT NULL
  AND b.name = p.brand::text;

-- Orphan / null brand → Tamara fallback (keeps FK usable)
UPDATE products
SET brand_id = (SELECT id FROM brands WHERE name = 'Tamara' LIMIT 1)
WHERE brand_id IS NULL;

-- Backfill rice_category from rice_type
UPDATE products
SET rice_category = CASE
  WHEN rice_type::text IN ('basmati', 'raw_basmati', 'steam_basmati', 'white_sella', 'golden_sella')
    THEN 'basmati'::rice_code_category_enum
  WHEN rice_type IS NOT NULL
    THEN 'non_basmati'::rice_code_category_enum
  ELSE 'basmati'::rice_code_category_enum
END
WHERE rice_category IS NULL;

ALTER TABLE products
  ALTER COLUMN rice_category SET NOT NULL,
  ALTER COLUMN brand_id SET NOT NULL;

-- Backfill HSN where missing (sales e-invoice requirement)
UPDATE products
SET hsn_code = '100630'
WHERE hsn_code IS NULL OR TRIM(hsn_code) = '';

-- Dedupe product names within brand before unique index (legacy data may collide)
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY brand_id, LOWER(name)
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM products
)
UPDATE products p
SET name = TRIM(p.name) || ' (' || ranked.rn || ')'
FROM ranked
WHERE p.id = ranked.id
  AND ranked.rn > 1;

-- Generate product codes for existing rows (BRANDPREFIX-NNN)
WITH numbered AS (
  SELECT
    p.id,
    b.code_prefix,
    ROW_NUMBER() OVER (PARTITION BY p.brand_id ORDER BY p.created_at ASC, p.id ASC) AS rn
  FROM products p
  INNER JOIN brands b ON b.id = p.brand_id
  WHERE p.product_code IS NULL
)
UPDATE products p
SET product_code = n.code_prefix || '-' || LPAD(n.rn::text, 3, '0')
FROM numbered n
WHERE p.id = n.id;

-- Advance sequences past max used number per brand
UPDATE brand_product_sequences bps
SET next_number = GREATEST(
  bps.next_number,
  COALESCE((
    SELECT MAX(
      CASE
        WHEN p.product_code ~ ('^' || b.code_prefix || '-[0-9]+$')
          THEN SUBSTRING(p.product_code FROM LENGTH(b.code_prefix) + 2)::INT
        ELSE 0
      END
    ) + 1
    FROM products p
    INNER JOIN brands b ON b.id = p.brand_id
    WHERE p.brand_id = bps.brand_id
  ), 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_product_code_unique
  ON products (product_code)
  WHERE product_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_brand_name_lower
  ON products (brand_id, LOWER(name));

CREATE INDEX IF NOT EXISTS idx_products_brand_id ON products (brand_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products (status);
CREATE INDEX IF NOT EXISTS idx_products_rice_category ON products (rice_category);

COMMENT ON COLUMN products.brand_id IS 'FK to brands master; display name via brands.name';
COMMENT ON COLUMN products.rice_category IS 'Basmati / Non-Basmati; rice_type kept for sales commission dual-write';
COMMENT ON COLUMN products.product_code IS 'Auto-generated {BRAND_PREFIX}-{NNN}';
COMMENT ON COLUMN products.status IS 'Lifecycle: active | inactive | discontinued';
COMMENT ON COLUMN products.bag_image_url IS 'Product bag image URL; mandatory on new creates in API';

-- =====================================================
-- 5. Extend packaging (additive)
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'packaging_status_enum') THEN
    CREATE TYPE packaging_status_enum AS ENUM ('active', 'inactive');
  END IF;
END $$;

ALTER TABLE packaging
  ADD COLUMN IF NOT EXISTS packaging_material_id UUID REFERENCES packaging_materials(id),
  ADD COLUMN IF NOT EXISTS remarks VARCHAR(500),
  ADD COLUMN IF NOT EXISTS status packaging_status_enum NOT NULL DEFAULT 'active';

-- Backfill packaging_material_id from packet_type
UPDATE packaging p
SET packaging_material_id = pm.id
FROM packaging_materials pm
WHERE p.packaging_material_id IS NULL
  AND p.packet_type IS NOT NULL
  AND LOWER(TRIM(pm.name)) = LOWER(TRIM(p.packet_type));

-- Fallback material for any remaining nulls
UPDATE packaging
SET packaging_material_id = (
  SELECT id FROM packaging_materials WHERE name = 'PP Woven Bag' LIMIT 1
)
WHERE packaging_material_id IS NULL;

ALTER TABLE packaging
  ALTER COLUMN packaging_material_id SET NOT NULL;

-- =====================================================
-- 6. Dedupe packaging for unique (product, capacity, material)
-- Prefer survivor with earliest packaging_number / created_at.
-- Remap FKs then delete duplicates.
-- =====================================================
CREATE TEMP TABLE packaging_dedupe_map ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    id,
    product_id,
    holding_capacity,
    packaging_material_id,
    FIRST_VALUE(id) OVER (
      PARTITION BY product_id, holding_capacity, packaging_material_id
      ORDER BY packaging_number ASC NULLS LAST, created_at ASC, id ASC
    ) AS survivor_id
  FROM packaging
)
SELECT id AS duplicate_id, survivor_id
FROM ranked
WHERE id <> survivor_id;

-- Merge packets_inventory onto survivor (sum quantities)
WITH merged AS (
  SELECT
    m.survivor_id AS packaging_id,
    pi.godown_id,
    SUM(pi.available_quantity)::INT AS qty
  FROM packets_inventory pi
  INNER JOIN packaging_dedupe_map m ON m.duplicate_id = pi.packaging_id
  GROUP BY m.survivor_id, pi.godown_id
)
INSERT INTO packets_inventory (godown_id, packaging_id, available_quantity)
SELECT godown_id, packaging_id, qty FROM merged
ON CONFLICT (godown_id, packaging_id) DO UPDATE
SET available_quantity = packets_inventory.available_quantity + EXCLUDED.available_quantity,
    updated_at = CURRENT_TIMESTAMP;

DELETE FROM packets_inventory pi
USING packaging_dedupe_map m
WHERE pi.packaging_id = m.duplicate_id;

-- Remap referencing tables
UPDATE sales_sauda_lines ssl
SET packaging_id = m.survivor_id
FROM packaging_dedupe_map m
WHERE ssl.packaging_id = m.duplicate_id;

UPDATE invoice_dispatch_lines idl
SET packaging_id = m.survivor_id
FROM packaging_dedupe_map m
WHERE idl.packaging_id = m.duplicate_id;

UPDATE finished_goods_inventory fgi
SET packaging_id = m.survivor_id
FROM packaging_dedupe_map m
WHERE fgi.packaging_id = m.duplicate_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'batches' AND column_name = 'packaging_id'
  ) THEN
    UPDATE batches b
    SET packaging_id = m.survivor_id
    FROM packaging_dedupe_map m
    WHERE b.packaging_id = m.duplicate_id;
  END IF;
END $$;

-- Audit tables (best-effort)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'packets_inventory_audit'
  ) THEN
    UPDATE packets_inventory_audit a
    SET packaging_id = m.survivor_id
    FROM packaging_dedupe_map m
    WHERE a.packaging_id = m.duplicate_id;
  END IF;
END $$;

DELETE FROM packaging p
USING packaging_dedupe_map m
WHERE p.id = m.duplicate_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_packaging_product_capacity_material
  ON packaging (product_id, holding_capacity, packaging_material_id);

CREATE INDEX IF NOT EXISTS idx_packaging_material_id ON packaging (packaging_material_id);
CREATE INDEX IF NOT EXISTS idx_packaging_status ON packaging (status);

COMMENT ON COLUMN packaging.packaging_material_id IS 'FK to packaging_materials; packet_type kept as legacy alias';
COMMENT ON COLUMN packaging.remarks IS 'Optional remarks (max 500)';
COMMENT ON COLUMN packaging.status IS 'active | inactive';
