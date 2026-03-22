-- Add payment terms (number of days) to sales sauda header.
ALTER TABLE sales_saudas
ADD COLUMN IF NOT EXISTS payment_terms INTEGER CHECK (payment_terms >= 0);

COMMENT ON COLUMN sales_saudas.payment_terms IS 'Payment terms in days';
