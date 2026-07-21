-- Migration: Salesman commission types + assigned areas/customers; sauda commission snapshot

-- =====================================================
-- 1. Enabled commission types on salesman master
-- =====================================================
ALTER TABLE salesmen
  ADD COLUMN IF NOT EXISTS commission_types TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE salesmen
  DROP CONSTRAINT IF EXISTS salesmen_commission_types_check;

ALTER TABLE salesmen
  ADD CONSTRAINT salesmen_commission_types_check
  CHECK (
    commission_types <@ ARRAY[
      'per_kg',
      'percent_of_sale',
      'fixed_per_transaction',
      'by_rice_quality',
      'by_customer'
    ]::TEXT[]
  );

COMMENT ON COLUMN salesmen.commission_types IS
  'Subset of commission types available for this salesman; rates are set per sales sauda';

-- =====================================================
-- 2. Assigned areas
-- =====================================================
CREATE TABLE IF NOT EXISTS salesman_assigned_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salesman_id UUID NOT NULL REFERENCES salesmen(id) ON DELETE CASCADE,
  state VARCHAR(100),
  district VARCHAR(100),
  city VARCHAR(100),
  territory VARCHAR(150),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT salesman_assigned_areas_nonempty_check CHECK (
    NULLIF(TRIM(COALESCE(state, '')), '') IS NOT NULL
    OR NULLIF(TRIM(COALESCE(district, '')), '') IS NOT NULL
    OR NULLIF(TRIM(COALESCE(city, '')), '') IS NOT NULL
    OR NULLIF(TRIM(COALESCE(territory, '')), '') IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_salesman_assigned_areas_salesman
  ON salesman_assigned_areas(salesman_id);

CREATE UNIQUE INDEX IF NOT EXISTS salesman_assigned_areas_unique_idx
  ON salesman_assigned_areas (
    salesman_id,
    COALESCE(LOWER(TRIM(state)), ''),
    COALESCE(LOWER(TRIM(district)), ''),
    COALESCE(LOWER(TRIM(city)), ''),
    COALESCE(LOWER(TRIM(territory)), '')
  );

COMMENT ON TABLE salesman_assigned_areas IS
  'Geographic coverage for a salesman (state / district / city / territory)';

-- =====================================================
-- 3. Customer allocation
-- =====================================================
CREATE TABLE IF NOT EXISTS salesman_customer_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salesman_id UUID NOT NULL REFERENCES salesmen(id) ON DELETE CASCADE,
  sales_party_id UUID NOT NULL REFERENCES sales_parties(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT salesman_customer_allocations_unique UNIQUE (salesman_id, sales_party_id)
);

CREATE INDEX IF NOT EXISTS idx_salesman_customer_allocations_salesman
  ON salesman_customer_allocations(salesman_id);

CREATE INDEX IF NOT EXISTS idx_salesman_customer_allocations_party
  ON salesman_customer_allocations(sales_party_id);

COMMENT ON TABLE salesman_customer_allocations IS
  'Sales parties allocated to a salesman';

-- =====================================================
-- 4. Sales sauda commission snapshot (applied on attach)
-- =====================================================
ALTER TABLE sales_saudas
  ADD COLUMN IF NOT EXISTS salesman_commission_type VARCHAR(40),
  ADD COLUMN IF NOT EXISTS salesman_commission_config JSONB;

ALTER TABLE sales_saudas
  DROP CONSTRAINT IF EXISTS sales_saudas_salesman_commission_type_check;

ALTER TABLE sales_saudas
  ADD CONSTRAINT sales_saudas_salesman_commission_type_check
  CHECK (
    salesman_commission_type IS NULL
    OR salesman_commission_type IN (
      'per_kg',
      'percent_of_sale',
      'fixed_per_transaction',
      'by_rice_quality',
      'by_customer'
    )
  );

ALTER TABLE sales_saudas
  DROP CONSTRAINT IF EXISTS sales_saudas_salesman_commission_pair_check;

ALTER TABLE sales_saudas
  ADD CONSTRAINT sales_saudas_salesman_commission_pair_check
  CHECK (
    (salesman_commission_type IS NULL AND salesman_commission_config IS NULL)
    OR (salesman_commission_type IS NOT NULL AND salesman_commission_config IS NOT NULL)
  );

COMMENT ON COLUMN sales_saudas.salesman_commission_type IS
  'Commission type applied for this sauda (snapshot; one of salesman enabled types)';
COMMENT ON COLUMN sales_saudas.salesman_commission_config IS
  'Commission rate values for the applied type (JSONB snapshot)';
