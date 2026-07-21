-- Migration: Add retail registration_type and customer_type to sales_parties
-- retail → lightweight walk-in / cash customers (no GST/PAN/Aadhaar KYC)
-- customer_type is required only when registration_type = 'retail' (enforced in app)

ALTER TYPE transport_type_enum ADD VALUE IF NOT EXISTS 'retail';

DO $$ BEGIN
  CREATE TYPE sales_party_customer_type_enum AS ENUM (
    'individual',
    'small_retailer',
    'cash_customer'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE sales_parties
  ADD COLUMN IF NOT EXISTS customer_type sales_party_customer_type_enum;

CREATE INDEX IF NOT EXISTS idx_sales_parties_customer_type
  ON sales_parties(customer_type)
  WHERE customer_type IS NOT NULL;

COMMENT ON COLUMN sales_parties.registration_type IS
  'registered (GST/PAN KYC), unregistered (Aadhaar KYC), or retail (no KYC; requires customer_type)';
COMMENT ON COLUMN sales_parties.customer_type IS
  'Retail customer type: individual | small_retailer | cash_customer. Required only when registration_type = retail.';
