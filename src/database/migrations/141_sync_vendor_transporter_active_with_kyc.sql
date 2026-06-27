-- Migration: Tie vendor and transporter is_active to KYC verification status
-- Unverified parties are inactive; verified parties are active.

-- Vendors: ensure is_verified reflects stored KYC snapshots (idempotent with migration 138)
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

UPDATE vendors
SET is_active = is_verified;

-- Transporters: ensure is_verified reflects stored KYC snapshots (idempotent with migration 134)
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

UPDATE transporters
SET is_active = is_verified;

COMMENT ON COLUMN vendors.is_active IS 'False until primary KYC is verified; set active automatically when is_verified becomes true';
COMMENT ON COLUMN transporters.is_active IS 'False until primary KYC is verified; set active automatically when is_verified becomes true';
