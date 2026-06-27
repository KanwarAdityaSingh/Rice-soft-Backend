-- Allow re-using a driving licence number after soft delete (inactive drivers).

ALTER TABLE drivers DROP CONSTRAINT IF EXISTS uq_drivers_license_number;

CREATE UNIQUE INDEX IF NOT EXISTS uq_drivers_license_number_active
  ON drivers (license_number)
  WHERE is_active = true;

COMMENT ON INDEX uq_drivers_license_number_active IS
  'Licence numbers must be unique among active drivers; inactive (soft-deleted) rows may duplicate.';
