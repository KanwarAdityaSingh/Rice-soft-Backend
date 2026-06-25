import type { EntityKycVerificationDetails } from './kyc-verification.model';

export interface Address {
  street: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

export interface ContactPerson {
  name: string;
  phones: string[];
  emails?: string[];
}

export interface BusinessDetails {
  pan_number?: string;
  gst_number?: string;
  registration_number?: string;
  business_type?: 'individual' | 'partnership' | 'company' | 'llp';
}

export interface BankDetails {
  account_holder_name?: string;
  account_number?: string;
  ifsc_code?: string;
  bank_name?: string;
  branch?: string;
}

export type VendorType = 'purchaser' | 'seller' | 'both';

/** Registered → GST/PAN; unregistered → Aadhaar (mirrors transporter transport_type). */
export type VendorRegistrationType = 'registered' | 'unregistered';

export interface Vendor {
  id: string;
  business_name: string;
  contact_persons: ContactPerson[];
  // Legacy fields - kept for backward compatibility
  contact_person: string;
  email: string | null;
  phone: string;
  address: Address;
  business_details: BusinessDetails;
  aadhar_number: string | null;
  registration_type: VendorRegistrationType;
  bank_details: BankDetails | null;
  type: VendorType;
  is_active: boolean;
  is_verified: boolean;
  verified_at: Date | null;
  user_id: string | null;
  lead_id: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
  last_enquiry_date: Date | null;
  google_location_link: string | null;
  business_card_url: string | null;
  /** Set when confirm-bank-verification succeeds; cleared when bank_details are updated */
  bank_details_verified_at: Date | null;
  bank_details_verified_by: string | null;
  /** Last failed verify_bank / confirm attempt; cleared on success or bank_details update */
  bank_verification_error: string | null;
  kyc_verification_details: EntityKycVerificationDetails;
}

export interface CreateVendorDTO {
  business_name: string;
  contact_persons: ContactPerson[];
  address: Address;
  business_details: BusinessDetails;
  aadhar_number?: string;
  registration_type: VendorRegistrationType;
  bank_details?: BankDetails;
  type: VendorType;
  is_active?: boolean;
  is_verified?: boolean;
  verified_at?: string | null;
  created_by?: string;
  user_id?: string;
  lead_id?: string;
  google_location_link?: string;
  business_card_url?: string;
  /** If true, attempt Surepass verification after insert; on failure vendor is kept unverified (lenient). */
  verify_bank?: boolean;
  /** Partial Surepass snapshots merged into kyc_verification_details JSONB. */
  kyc_verification_details?: EntityKycVerificationDetails;
}

export interface UpdateVendorDTO {
  business_name?: string;
  contact_persons?: ContactPerson[];
  address?: Address;
  business_details?: BusinessDetails;
  aadhar_number?: string;
  registration_type?: VendorRegistrationType;
  bank_details?: BankDetails;
  type?: VendorType;
  is_active?: boolean;
  is_verified?: boolean;
  verified_at?: string | null;
  lead_id?: string;
  updated_by?: string;
  google_location_link?: string;
  business_card_url?: string;
  /** If true, attempt Surepass verification after bank_details update; on failure vendor is kept unverified (lenient). */
  verify_bank?: boolean;
  kyc_verification_details?: EntityKycVerificationDetails;
}

export interface VendorResponse {
  id: string;
  business_name: string;
  contact_persons: ContactPerson[];
  address: Address;
  business_details: BusinessDetails;
  aadhar_number: string | null;
  registration_type: VendorRegistrationType;
  bank_details: BankDetails | null;
  type: VendorType;
  is_active: boolean;
  is_verified: boolean;
  verified_at: string | null;
  user_id: string | null;
  lead_id: string | null;
  created_at: string;
  updated_at: string;
  last_enquiry_date: string | null;
  google_location_link: string | null;
  business_card_url: string | null;
  bank_details_verified_at: string | null;
  bank_details_verified_by: string | null;
  bank_verification_error: string | null;
  kyc_verification_details: EntityKycVerificationDetails;
}
