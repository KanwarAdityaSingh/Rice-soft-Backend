-- Rename sales_saudas.customer_id to sales_party_id for consistency with Sales Party module

-- 1. Drop existing FK constraint (name from 100 migration)
ALTER TABLE sales_saudas DROP CONSTRAINT IF EXISTS sales_saudas_customer_id_fkey;

-- 2. Drop index on old column name
DROP INDEX IF EXISTS idx_sales_saudas_customer_id;

-- 3. Rename column
ALTER TABLE sales_saudas RENAME COLUMN customer_id TO sales_party_id;

-- 4. Add FK with new column name
ALTER TABLE sales_saudas
  ADD CONSTRAINT sales_saudas_sales_party_id_fkey
  FOREIGN KEY (sales_party_id) REFERENCES sales_parties(id) ON DELETE RESTRICT;

-- 5. Recreate index
CREATE INDEX IF NOT EXISTS idx_sales_saudas_sales_party_id ON sales_saudas(sales_party_id);

-- 6. Update comment
COMMENT ON COLUMN sales_saudas.sales_party_id IS 'Reference to sales party';
