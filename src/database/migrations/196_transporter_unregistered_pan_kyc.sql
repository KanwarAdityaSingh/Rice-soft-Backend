-- Unregistered transporters: treat PAN KYC (as well as Aadhaar) as primary verification.
UPDATE transporters
SET is_verified = true,
    verified_at = COALESCE(verified_at, NOW()),
    is_active = true,
    updated_at = NOW()
WHERE is_verified = false
  AND transport_type = 'unregistered'
  AND (
    (kyc_verification_details ? 'aadhaar' AND kyc_verification_details->'aadhaar' IS NOT NULL)
    OR (kyc_verification_details ? 'pan_comprehensive' AND kyc_verification_details->'pan_comprehensive' IS NOT NULL)
    OR (kyc_verification_details ? 'pan' AND kyc_verification_details->'pan' IS NOT NULL)
  );

COMMENT ON COLUMN transporters.is_verified IS
  'True when primary KYC is verified: registered → GST/PAN; unregistered → Aadhaar or PAN; individual → always';
