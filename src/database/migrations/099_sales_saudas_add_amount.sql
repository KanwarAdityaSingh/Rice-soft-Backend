-- Add total amount to sales sauda header (sent by frontend on create/update)
ALTER TABLE sales_saudas
  ADD COLUMN IF NOT EXISTS amount DECIMAL(14,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN sales_saudas.amount IS 'Total amount of the sauda (sum of line amounts); sent by frontend on create';
