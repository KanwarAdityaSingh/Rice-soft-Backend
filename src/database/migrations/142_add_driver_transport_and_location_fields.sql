-- Father name, transport DOE, and location fields from Surepass DL verification

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS father_or_husband_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS transport_license_expires_at DATE,
  ADD COLUMN IF NOT EXISTS state VARCHAR(100),
  ADD COLUMN IF NOT EXISTS city_name VARCHAR(255);

COMMENT ON COLUMN drivers.father_or_husband_name IS 'Father or husband name from Surepass DL verification';
COMMENT ON COLUMN drivers.transport_license_expires_at IS 'Transport licence valid-until (transport_doe) from Surepass';
COMMENT ON COLUMN drivers.state IS 'State from Surepass DL verification';
COMMENT ON COLUMN drivers.city_name IS 'City or OLA name from Surepass DL verification';

UPDATE drivers
SET
  father_or_husband_name = COALESCE(
    father_or_husband_name,
    NULLIF(verification_details->'mapped'->>'father_or_husband_name', '')
  ),
  transport_license_expires_at = COALESCE(
    transport_license_expires_at,
    NULLIF(verification_details->'mapped'->>'transport_date_of_expiry', '')::date
  ),
  state = COALESCE(
    state,
    NULLIF(verification_details->'mapped'->>'state', '')
  ),
  city_name = COALESCE(
    city_name,
    NULLIF(verification_details->'mapped'->>'city_name', ''),
    NULLIF(verification_details->'mapped'->>'ola_name', '')
  )
WHERE verification_details IS NOT NULL
  AND verification_details->>'provider' = 'surepass';
