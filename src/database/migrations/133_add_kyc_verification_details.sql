-- Persist full Surepass API responses per business entity module.

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS kyc_verification_details JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE brokers
  ADD COLUMN IF NOT EXISTS kyc_verification_details JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE transporters
  ADD COLUMN IF NOT EXISTS kyc_verification_details JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS verification_details JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN vendors.kyc_verification_details IS 'Surepass snapshots: pan, gst_advanced, aadhaar, bank, email, etc. { key: { provider, verified_at, raw, mapped? } }';
COMMENT ON COLUMN brokers.kyc_verification_details IS 'Surepass snapshots keyed by verification type (pan, gst_advanced, aadhaar, bank, email, ...)';
COMMENT ON COLUMN transporters.kyc_verification_details IS 'Surepass snapshots keyed by verification type';
COMMENT ON COLUMN vehicles.verification_details IS 'Surepass RC and RC challan snapshots { rc?, rc_challan? }';
