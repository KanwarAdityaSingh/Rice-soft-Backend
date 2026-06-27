/**
 * Canonical form stored in DB: trimmed, uppercased, internal whitespace collapsed to single space.
 */
import type { DriverLicenseVerificationResult } from '../models/driver.model';

export function normalizeDrivingLicenseForStorage(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().toUpperCase();
}

/**
 * Surepass (and many providers) expect a compact id_number without spaces.
 */
export function normalizeDrivingLicenseForProvider(raw: string): string {
  return normalizeDrivingLicenseForStorage(raw).replace(/\s/g, '');
}

/** Accept `license_number` or Surepass-style `id_number` from request bodies. */
export function resolveDriverLicenseInput(input: {
  license_number?: string;
  id_number?: string;
}): string {
  const lic = input.license_number?.trim() || input.id_number?.trim();
  if (!lic) {
    throw new Error('license_number or id_number is required');
  }
  return lic;
}

/** Ignore sentinel / invalid expiry dates (e.g. Surepass transport_doe "1800-01-01"). */
export function parseDrivingLicenseExpiryDate(doe: string | undefined | null): string | null {
  if (!doe || typeof doe !== 'string') {
    return null;
  }
  const trimmed = doe.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }
  const year = parseInt(trimmed.slice(0, 4), 10);
  if (year < 1900 || year > 2100) {
    return null;
  }
  return trimmed;
}

/** Parse transport DOE; accepts YYYY-MM-DD and DD-MM-YYYY / DD/MM/YYYY. */
export function parseTransportLicenseExpiryDate(value: string | undefined | null): string | null {
  const iso = parseDrivingLicenseExpiryDate(value);
  if (iso) {
    return iso;
  }
  const normalized = normalizeDriverDobForSurepass(value);
  if (!normalized) {
    return null;
  }
  return parseDrivingLicenseExpiryDate(normalized);
}

export interface TransportDoeResolution {
  raw: string;
  parsed: string;
}

/** Resolve transport DOE from create payload (body fields or verification snapshot). */
export function resolveTransportDoeForCreate(data: {
  transport_license_expires_at?: string | null;
  transport_doe?: string | null;
  verification_details?: unknown;
}): TransportDoeResolution | null {
  let fromSnapshot: string | null = null;
  if (
    data.verification_details &&
    typeof data.verification_details === 'object' &&
    !Array.isArray(data.verification_details)
  ) {
    const mapped = (data.verification_details as { mapped?: DriverLicenseVerificationResult }).mapped;
    fromSnapshot = mapped?.transport_date_of_expiry?.trim() || null;
  }

  const raw = (data.transport_license_expires_at ?? data.transport_doe ?? fromSnapshot)?.trim();
  if (!raw) {
    return null;
  }

  const parsed = parseTransportLicenseExpiryDate(raw);
  if (!parsed) {
    return { raw, parsed: '' };
  }

  return { raw, parsed };
}

/**
 * Normalize DOB for Surepass DL verify.
 * Accepts YYYY-MM-DD, ISO datetime, DD-MM-YYYY, DD/MM/YYYY.
 */
export function normalizeDriverDobForSurepass(dob: string | undefined | null): string | null {
  if (dob === undefined || dob === null) {
    return null;
  }
  const s = String(dob).trim();
  if (!s) {
    return null;
  }

  const isoPrefix = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (isoPrefix) {
    return isoPrefix[1];
  }

  const dmy = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(s);
  if (dmy) {
    const [, dd, mm, yyyy] = dmy;
    const day = dd.padStart(2, '0');
    const month = mm.padStart(2, '0');
    const monthNum = parseInt(month, 10);
    const dayNum = parseInt(day, 10);
    if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) {
      return null;
    }
    return `${yyyy}-${month}-${day}`;
  }

  return null;
}

export interface DriverProfileFromMapped {
  name: string | null;
  date_of_birth: string | null;
  license_expires_at: string | null;
  transport_license_expires_at: string | null;
  father_or_husband_name: string | null;
  state: string | null;
  city_name: string | null;
  address: string | null;
  pincode: string | null;
  gender: string | null;
  profile_image: string | null;
  vehicle_classes: string[];
}

/** Extract first-class driver columns from a Surepass DL mapped payload. */
export function driverProfileFromMapped(
  mapped: DriverLicenseVerificationResult | undefined | null
): DriverProfileFromMapped {
  if (!mapped) {
    return {
      name: null,
      date_of_birth: null,
      license_expires_at: null,
      transport_license_expires_at: null,
      father_or_husband_name: null,
      state: null,
      city_name: null,
      address: null,
      pincode: null,
      gender: null,
      profile_image: null,
      vehicle_classes: [],
    };
  }

  return {
    name: mapped.full_name?.trim() || null,
    date_of_birth: mapped.date_of_birth?.trim() || null,
    license_expires_at: parseDrivingLicenseExpiryDate(mapped.date_of_expiry),
    transport_license_expires_at: parseTransportLicenseExpiryDate(mapped.transport_date_of_expiry),
    father_or_husband_name: mapped.father_or_husband_name?.trim() || null,
    state: mapped.state?.trim() || null,
    city_name: mapped.city_name?.trim() || mapped.ola_name?.trim() || null,
    address: mapped.address?.trim() || null,
    pincode: mapped.pincode?.trim() || null,
    gender: mapped.gender?.trim() || null,
    profile_image: mapped.profile_image || null,
    vehicle_classes: mapped.vehicle_classes ?? [],
  };
}
