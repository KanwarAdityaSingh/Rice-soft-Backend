-- Hard delete replaced soft delete: licence numbers must be unique across all drivers.

DROP INDEX IF EXISTS uq_drivers_license_number_active;

-- Keep one row per licence (prefer active, then most recently updated).
DELETE FROM drivers d
USING (
  SELECT id
  FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY license_number
        ORDER BY is_active DESC, updated_at DESC NULLS LAST, created_at DESC
      ) AS rn
    FROM drivers
  ) ranked
  WHERE rn > 1
) dup
WHERE d.id = dup.id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_drivers_license_number
  ON drivers (license_number);

COMMENT ON INDEX uq_drivers_license_number IS
  'Driving licence numbers must be unique among all driver rows';
