-- Driver profile fields aligned with Surepass DL verification (VAHAN/SARATHI-style ops reporting)

ALTER TABLE drivers ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS license_expires_at DATE;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS address TEXT;

COMMENT ON COLUMN drivers.date_of_birth IS 'Holder DOB from verification or manual entry';
COMMENT ON COLUMN drivers.license_expires_at IS 'DL valid-until (DOE) from verification or manual entry';
COMMENT ON COLUMN drivers.address IS 'Address from verification or manual entry';
COMMENT ON COLUMN drivers.verification_details IS 'Structured snapshot: { provider, mapped, raw? }';
