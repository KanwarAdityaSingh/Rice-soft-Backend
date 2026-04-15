/** Raw JSON from Surepass driving-license API once integrated */
export type DriverVerificationDetails = Record<string, unknown> | null;

export interface Driver {
  id: string;
  license_number: string;
  phone: string;
  name: string | null;
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
  is_verified: boolean;
  verified_at: string | null;
  verification_details: DriverVerificationDetails;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
