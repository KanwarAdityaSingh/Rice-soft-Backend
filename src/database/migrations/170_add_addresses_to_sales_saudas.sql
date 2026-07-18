-- Billing and delivery addresses on sales sauda (same Address JSON shape as vendors/sales parties).
ALTER TABLE sales_saudas
  ADD COLUMN IF NOT EXISTS billing_address JSONB,
  ADD COLUMN IF NOT EXISTS delivery_address JSONB;

COMMENT ON COLUMN sales_saudas.billing_address IS
  'Billing address snapshot: { street, city, state, pincode, country }';
COMMENT ON COLUMN sales_saudas.delivery_address IS
  'Delivery address snapshot: { street, city, state, pincode, country }';
