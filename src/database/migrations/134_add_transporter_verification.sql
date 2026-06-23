-- Migration: Add verification status to transporters
-- Description: Track Surepass KYC verification (registered GST/PAN, unregistered Aadhaar)

ALTER TABLE transporters
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_transporters_is_verified ON transporters(is_verified);

COMMENT ON COLUMN transporters.is_verified IS 'True when primary KYC is verified: registered → GST/PAN snapshot, unregistered → Aadhaar snapshot';
COMMENT ON COLUMN transporters.verified_at IS 'Timestamp when transporter was marked verified via KYC';

-- Backfill from existing kyc_verification_details JSONB
UPDATE transporters
SET is_verified = true,
    verified_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)
WHERE is_verified = false
  AND (
    (
      transport_type = 'unregistered'
      AND kyc_verification_details ? 'aadhaar'
      AND kyc_verification_details->'aadhaar' IS NOT NULL
    )
    OR (
      transport_type = 'registered'
      AND (
        (kyc_verification_details ? 'gst_advanced' AND kyc_verification_details->'gst_advanced' IS NOT NULL)
        OR (kyc_verification_details ? 'gst' AND kyc_verification_details->'gst' IS NOT NULL)
        OR (kyc_verification_details ? 'pan_comprehensive' AND kyc_verification_details->'pan_comprehensive' IS NOT NULL)
        OR (kyc_verification_details ? 'pan' AND kyc_verification_details->'pan' IS NOT NULL)
      )
    )
  );
