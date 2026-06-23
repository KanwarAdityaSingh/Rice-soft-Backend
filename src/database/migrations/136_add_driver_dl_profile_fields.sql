-- Extended DL profile fields from Surepass verification

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS gender VARCHAR(10),
  ADD COLUMN IF NOT EXISTS pincode VARCHAR(10),
  ADD COLUMN IF NOT EXISTS profile_image TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_classes TEXT[] DEFAULT ARRAY[]::TEXT[];

COMMENT ON COLUMN drivers.gender IS 'DL holder gender from Surepass verification';
COMMENT ON COLUMN drivers.pincode IS 'Address PIN from Surepass verification';
COMMENT ON COLUMN drivers.profile_image IS 'Base64 profile photo from Surepass DL verification';
COMMENT ON COLUMN drivers.vehicle_classes IS 'DL vehicle class codes (e.g. MCWG, LMV) from Surepass';

-- Backfill from stored verification snapshots
UPDATE drivers
SET
  gender = COALESCE(gender, NULLIF(verification_details->'mapped'->>'gender', '')),
  pincode = COALESCE(
    pincode,
    NULLIF(verification_details->'mapped'->>'pincode', ''),
    NULLIF(verification_details->'raw'->'data'->>'permanent_zip', ''),
    NULLIF(verification_details->'raw'->'data'->>'temporary_zip', '')
  ),
  profile_image = COALESCE(
    profile_image,
    NULLIF(verification_details->'mapped'->>'profile_image', '')
  ),
  vehicle_classes = CASE
    WHEN vehicle_classes IS NULL OR cardinality(vehicle_classes) = 0 THEN
      COALESCE(
        ARRAY(
          SELECT jsonb_array_elements_text(verification_details->'mapped'->'vehicle_classes')
        ),
        ARRAY[]::TEXT[]
      )
    ELSE vehicle_classes
  END
WHERE verification_details IS NOT NULL
  AND verification_details->>'provider' = 'surepass';
