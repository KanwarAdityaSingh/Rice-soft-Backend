-- Migration: Add registration_type and identity verification to sales_parties
-- Mirrors vendors: registered → GST/PAN KYC, unregistered → Aadhaar KYC

ALTER TABLE sales_parties
  ADD COLUMN IF NOT EXISTS registration_type transport_type_enum NOT NULL DEFAULT 'registered',
  ADD COLUMN IF NOT EXISTS aadhar_number VARCHAR(12),
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS kyc_verification_details JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$ BEGIN
  ALTER TABLE sales_parties ADD CONSTRAINT sales_parties_aadhar_number_check
    CHECK (aadhar_number IS NULL OR (LENGTH(aadhar_number) = 12 AND aadhar_number ~ '^[0-9]{12}$'));
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS idx_sales_parties_registration_type ON sales_parties(registration_type);
CREATE INDEX IF NOT EXISTS idx_sales_parties_aadhar_number ON sales_parties(aadhar_number) WHERE aadhar_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_parties_is_verified ON sales_parties(is_verified);

CREATE UNIQUE INDEX IF NOT EXISTS sales_parties_aadhar_number_unique_idx
  ON sales_parties(aadhar_number)
  WHERE aadhar_number IS NOT NULL AND aadhar_number != '';

COMMENT ON COLUMN sales_parties.registration_type IS 'registered when GST on file; unregistered otherwise (backfill). Set explicitly on create.';
COMMENT ON COLUMN sales_parties.aadhar_number IS 'Aadhaar number (12 digits) — primary ID for unregistered sales parties';
COMMENT ON COLUMN sales_parties.is_verified IS 'True when primary KYC is verified: registered → GST/PAN snapshot, unregistered → Aadhaar snapshot';
COMMENT ON COLUMN sales_parties.verified_at IS 'Timestamp when sales party was marked verified via KYC';
COMMENT ON COLUMN sales_parties.kyc_verification_details IS 'Surepass snapshots: pan, gst_advanced, aadhaar, bank, email, etc.';

UPDATE sales_parties
SET registration_type = CASE
  WHEN business_details->>'gst_number' IS NOT NULL
       AND TRIM(business_details->>'gst_number') <> ''
    THEN 'registered'::transport_type_enum
  ELSE 'unregistered'::transport_type_enum
END;
