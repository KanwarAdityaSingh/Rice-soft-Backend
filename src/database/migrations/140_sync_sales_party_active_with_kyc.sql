-- Migration: Tie sales party is_active to KYC verification status
-- Unverified sales parties are inactive; verified parties are active.

-- Backfill is_verified from stored KYC snapshots (mirrors vendors migration 138)
UPDATE sales_parties
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

-- Sync is_active with verification status
UPDATE sales_parties
SET is_active = is_verified;

COMMENT ON COLUMN sales_parties.is_active IS 'False until primary KYC is verified; set active automatically when is_verified becomes true';
