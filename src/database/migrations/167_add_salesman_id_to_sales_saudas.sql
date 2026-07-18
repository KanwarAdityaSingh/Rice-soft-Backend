-- Add optional salesman reference to sales sauda header.
ALTER TABLE sales_saudas
ADD COLUMN IF NOT EXISTS salesman_id UUID REFERENCES salesmen(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_saudas_salesman_id ON sales_saudas(salesman_id);

COMMENT ON COLUMN sales_saudas.salesman_id IS 'Reference to salesman who owns/handled this sales sauda';
