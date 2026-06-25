-- Migration: Add registration_type and identity verification to vendors
-- Mirrors transporters: registered → GST/PAN KYC, unregistered → Aadhaar KYC

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS registration_type transport_type_enum NOT NULL DEFAULT 'registered',
  ADD COLUMN IF NOT EXISTS aadhar_number VARCHAR(12),
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE;

DO $$ BEGIN
  ALTER TABLE vendors ADD CONSTRAINT vendors_aadhar_number_check
    CHECK (aadhar_number IS NULL OR (LENGTH(aadhar_number) = 12 AND aadhar_number ~ '^[0-9]{12}$'));
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS idx_vendors_registration_type ON vendors(registration_type);
CREATE INDEX IF NOT EXISTS idx_vendors_aadhar_number ON vendors(aadhar_number) WHERE aadhar_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vendors_is_verified ON vendors(is_verified);

CREATE UNIQUE INDEX IF NOT EXISTS vendors_aadhar_number_unique_idx
  ON vendors(aadhar_number)
  WHERE aadhar_number IS NOT NULL AND aadhar_number != '';

COMMENT ON COLUMN vendors.registration_type IS 'registered when GST on file; unregistered otherwise (backfill). Set explicitly on create.';
COMMENT ON COLUMN vendors.aadhar_number IS 'Aadhaar number (12 digits) — primary ID for unregistered vendors';
COMMENT ON COLUMN vendors.is_verified IS 'True when primary KYC is verified: registered → GST/PAN snapshot, unregistered → Aadhaar snapshot';
COMMENT ON COLUMN vendors.verified_at IS 'Timestamp when vendor was marked verified via KYC';

-- Backfill registration_type: GST on file → registered, otherwise unregistered
UPDATE vendors
SET registration_type = CASE
  WHEN business_details->>'gst_number' IS NOT NULL
       AND TRIM(business_details->>'gst_number') <> ''
    THEN 'registered'::transport_type_enum
  ELSE 'unregistered'::transport_type_enum
END;

UPDATE vendors
SET is_verified = true,
    verified_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)
WHERE is_verified = false
  AND (
    (
      registration_type = 'unregistered'
      AND kyc_verification_details ? 'aadhaar'
      AND kyc_verification_details->'aadhaar' IS NOT NULL
    )
    OR (
      registration_type = 'registered'
      AND (
        (kyc_verification_details ? 'gst_advanced' AND kyc_verification_details->'gst_advanced' IS NOT NULL)
        OR (kyc_verification_details ? 'gst' AND kyc_verification_details->'gst' IS NOT NULL)
        OR (kyc_verification_details ? 'pan_comprehensive' AND kyc_verification_details->'pan_comprehensive' IS NOT NULL)
        OR (kyc_verification_details ? 'pan' AND kyc_verification_details->'pan' IS NOT NULL)
      )
    )
  );
