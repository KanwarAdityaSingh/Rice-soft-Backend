/**
 * Canonical Indian vehicle registration number: uppercase, no spaces/dashes/slashes.
 * e.g. "HR55AZ/6789", "hr55az6789" → "HR55AZ6789"
 */
export function normalizeVehicleNumber(vehicleNumber: string): string {
  return vehicleNumber.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** SQL expression matching {@link normalizeVehicleNumber} on a column. */
export const VEHICLE_NUMBER_CANONICAL_SQL =
  "regexp_replace(UPPER(TRIM(vehicle_number)), '[^A-Z0-9]', '', 'g')";
