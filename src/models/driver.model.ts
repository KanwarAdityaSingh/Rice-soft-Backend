/** Normalized fields returned by Surepass DL verify and used across API + persistence. */
export interface DriverLicenseVerificationResult {
  license_number: string;
  full_name: string;
  date_of_birth: string;
  date_of_expiry: string;
  age: string | number | null;
  address: string;
  pincode?: string | null;
  state?: string | null;
  gender?: string | null;
  blood_group?: string | null;
  vehicle_classes?: string[];
  father_or_husband_name?: string | null;
  date_of_issue?: string | null;
  transport_date_of_expiry?: string | null;
  /** City from Surepass; falls back to ola_name when city_name is absent. */
  city_name?: string | null;
  profile_image?: string | null;
  has_image?: boolean;
  ola_name?: string | null;
  ola_code?: string | null;
}

/**
 * Persisted JSONB after successful provider verification (or manual admin snapshot).
 * Legacy rows may omit `provider`; treat as opaque JSON when reading.
 */
export interface DriverVerificationSnapshot {
  provider: 'surepass';
  mapped: DriverLicenseVerificationResult;
  raw?: Record<string, unknown>;
}

export type DriverVerificationDetails = DriverVerificationSnapshot | null;

export interface Driver {
  id: string;
  license_number: string;
  phone: string;
  name: string | null;
  date_of_birth: Date | string | null;
  license_expires_at: Date | string | null;
  transport_license_expires_at: Date | string | null;
  father_or_husband_name: string | null;
  state: string | null;
  city_name: string | null;
  address: string | null;
  pincode: string | null;
  gender: string | null;
  profile_image: string | null;
  vehicle_classes: string[];
  is_verified: boolean;
  verified_at: Date | null;
  verification_details: DriverVerificationDetails;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateDriverDTO {
  license_number: string;
  phone: string;
  name?: string | null;
  date_of_birth?: string | null;
  license_expires_at?: string | null;
  doe?: string | null;
  transport_license_expires_at?: string | null;
  transport_doe?: string | null;
  father_or_husband_name?: string | null;
  state?: string | null;
  city_name?: string | null;
  address?: string | null;
  pincode?: string | null;
  gender?: string | null;
  profile_image?: string | null;
  vehicle_classes?: string[];
  is_verified?: boolean;
  verified_at?: string | null;
  verification_details?: DriverVerificationDetails;
  is_active?: boolean;
  created_by?: string;
}

export interface UpdateDriverDTO {
  license_number?: string;
  phone?: string;
  name?: string | null;
  date_of_birth?: string | null;
  license_expires_at?: string | null;
  doe?: string | null;
  transport_license_expires_at?: string | null;
  transport_doe?: string | null;
  father_or_husband_name?: string | null;
  state?: string | null;
  city_name?: string | null;
  address?: string | null;
  pincode?: string | null;
  gender?: string | null;
  profile_image?: string | null;
  vehicle_classes?: string[];
  is_verified?: boolean;
  verified_at?: string | null;
  verification_details?: DriverVerificationDetails;
  is_active?: boolean;
  updated_by?: string;
}

export interface DriverResponse {
  id: string;
  license_number: string;
  phone: string;
  name: string | null;
  date_of_birth: string | null;
  license_expires_at: string | null;
  /** Alias for license_expires_at (DL valid until). */
  doe: string | null;
  transport_license_expires_at: string | null;
  /** Alias for transport_license_expires_at (transport DOE). */
  transport_doe: string | null;
  father_or_husband_name: string | null;
  state: string | null;
  city_name: string | null;
  address: string | null;
  pincode: string | null;
  gender: string | null;
  profile_image: string | null;
  vehicle_classes: string[];
  is_verified: boolean;
  verified_at: string | null;
  verification_details: DriverVerificationDetails;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function surepassDriverVerificationDetails(
  mapped: DriverLicenseVerificationResult,
  raw?: Record<string, unknown>
): DriverVerificationSnapshot {
  return raw !== undefined
    ? { provider: 'surepass', mapped, raw }
    : { provider: 'surepass', mapped };
}

/** True when a Surepass DL snapshot with holder name is stored. */
export function isDriverVerifiedFromDetails(details: DriverVerificationDetails | unknown): boolean {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return false;
  }
  const snapshot = details as DriverVerificationSnapshot;
  return (
    snapshot.provider === 'surepass' &&
    typeof snapshot.mapped === 'object' &&
    snapshot.mapped !== null &&
    Boolean(snapshot.mapped.full_name?.trim())
  );
}
