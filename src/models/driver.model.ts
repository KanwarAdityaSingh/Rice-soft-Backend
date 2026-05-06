/** Normalized fields returned by Surepass DL verify and used across API + persistence. */
export interface DriverLicenseVerificationResult {
  license_number: string;
  full_name: string;
  date_of_birth: string;
  date_of_expiry: string;
  age: string | number | null;
  address: string;
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
  address: string | null;
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
  address?: string | null;
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
  address?: string | null;
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
  address: string | null;
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
