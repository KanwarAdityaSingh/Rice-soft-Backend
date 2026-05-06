/**
 * Canonical form stored in DB: trimmed, uppercased, internal whitespace collapsed to single space.
 */
export function normalizeDrivingLicenseForStorage(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().toUpperCase();
}

/**
 * Surepass (and many providers) expect a compact id_number without spaces.
 */
export function normalizeDrivingLicenseForProvider(raw: string): string {
  return normalizeDrivingLicenseForStorage(raw).replace(/\s/g, '');
}
