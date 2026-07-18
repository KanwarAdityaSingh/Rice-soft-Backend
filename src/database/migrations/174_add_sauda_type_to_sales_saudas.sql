-- Sales sauda type: ex | for (validated in application code).
ALTER TABLE sales_saudas
  ADD COLUMN IF NOT EXISTS sauda_type VARCHAR(10);

COMMENT ON COLUMN sales_saudas.sauda_type IS
  'Sales sauda type: ex or for (application-enforced)';

CREATE INDEX IF NOT EXISTS idx_sales_saudas_sauda_type ON sales_saudas(sauda_type)
  WHERE sauda_type IS NOT NULL;
