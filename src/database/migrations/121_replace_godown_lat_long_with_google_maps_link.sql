-- Replace latitude/longitude with a single Google Maps URL on godowns.

ALTER TABLE godowns ADD COLUMN IF NOT EXISTS google_maps_link TEXT;

UPDATE godowns
SET google_maps_link = 'https://www.google.com/maps?q=' || latitude::text || ',' || longitude::text
WHERE latitude IS NOT NULL
  AND longitude IS NOT NULL
  AND (google_maps_link IS NULL OR google_maps_link = '');

COMMENT ON COLUMN godowns.google_maps_link IS 'Optional Google Maps link for warehouse location (replaces legacy latitude/longitude).';

ALTER TABLE godowns DROP COLUMN IF EXISTS latitude;
ALTER TABLE godowns DROP COLUMN IF EXISTS longitude;
