import { ContactPerson } from './vendor.model';
import type { EntityKycVerificationDetails } from './kyc-verification.model';

export interface Address {
  street: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

export interface BankDetails {
  account_holder_name?: string;
  bank_name?: string;
  ifsc_code?: string;
  account_number?: string;
  branch?: string;
}

export type TransportType = 'registered' | 'unregistered';

export interface Transporter {
  id: string;
  business_name: string;
  contact_persons: ContactPerson[];
  // Legacy fields - kept for backward compatibility
  contact_person: string;
  phone: string;
  email: string | null;
  address: Address;
  gst_number: string | null;
  pan_number: string | null;
  aadhar_number: string | null;
  transport_type: TransportType;
  vehicle_numbers: string[]; // Deprecated - use vehicle_ids instead
  vehicle_ids: string[]; // Array of vehicle UUIDs
  bank_details: BankDetails;
  bank_details_verified_at: Date | null;
  bank_details_verified_by: string | null;
  bank_verification_error: string | null;
  is_active: boolean;
  is_verified: boolean;
  verified_at: Date | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
  kyc_verification_details: EntityKycVerificationDetails;
}

export interface CreateTransporterDTO {
  business_name: string;
  /** Optional; stored as `[]` when omitted. Legacy columns use empty strings when no contacts. */
  contact_persons?: ContactPerson[];
  address: Address;
  gst_number?: string;
  pan_number?: string;
  aadhar_number?: string;
  transport_type: TransportType;
  vehicle_numbers?: string[]; // Deprecated - use vehicle_ids instead
  vehicle_ids?: string[];
  bank_details?: BankDetails;
  verify_bank?: boolean;
  is_active?: boolean;
  is_verified?: boolean;
  verified_at?: string | null;
  created_by?: string;
  kyc_verification_details?: EntityKycVerificationDetails;
}

export interface UpdateTransporterDTO {
  business_name?: string;
  contact_persons?: ContactPerson[];
  address?: Address;
  gst_number?: string;
  pan_number?: string;
  aadhar_number?: string;
  transport_type?: TransportType;
  vehicle_numbers?: string[]; // Deprecated - use vehicle_ids instead
  vehicle_ids?: string[];
  bank_details?: BankDetails;
  verify_bank?: boolean;
  is_active?: boolean;
  is_verified?: boolean;
  verified_at?: string | null;
  updated_by?: string;
  kyc_verification_details?: EntityKycVerificationDetails;
}

export interface TransporterResponse {
  id: string;
  business_name: string;
  contact_persons: ContactPerson[];
  address: Address;
  gst_number: string | null;
  pan_number: string | null;
  aadhar_number: string | null;
  transport_type: TransportType;
  vehicle_numbers: string[]; // Deprecated - use vehicle_ids instead
  vehicle_ids: string[];
  bank_details: BankDetails;
  bank_details_verified_at: string | null;
  bank_details_verified_by: string | null;
  bank_verification_error: string | null;
  is_active: boolean;
  is_verified: boolean;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
  kyc_verification_details: EntityKycVerificationDetails;
}

