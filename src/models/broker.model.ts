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
  aadhaar_number?: string;
  gst_number?: string;
  business_type?: 'individual' | 'company';
}

export interface BankDetails {
  account_holder_name?: string;
  account_number?: string;
  ifsc_code?: string;
  bank_name?: string;
  branch?: string;
}

export interface BrokerDetails {
  commission_rate?: number; // percentage
  specialization?: string; // rice, wheat, etc.
  experience_years?: string;
}

export type BrokerType = 'purchase' | 'sale' | 'both';

export interface Broker {
  id: string;
  business_name: string | null;
  contact_persons: ContactPerson[];
  // Legacy fields - kept for backward compatibility in database
  email: string;
  phone: string;
  address: Address;
  business_details: BusinessDetails;
  bank_details: BankDetails | null;
  broker_details: BrokerDetails | null;
  type: BrokerType;
  is_active: boolean;
  user_id: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
  /** Set when confirm-bank-verification succeeds; cleared when bank_details are updated */
  bank_details_verified_at: Date | null;
  bank_details_verified_by: string | null;
  /** Last failed verify_bank / confirm attempt; cleared on success or bank_details update */
  bank_verification_error: string | null;
  kyc_verification_details: EntityKycVerificationDetails;
}

export interface CreateBrokerDTO {
  business_name?: string;
  contact_persons: ContactPerson[];
  address: Address;
  business_details: BusinessDetails;
  bank_details?: BankDetails;
  broker_details?: BrokerDetails;
  type: BrokerType;
  is_active?: boolean;
  created_by?: string;
  user_id?: string;
  /** If true, attempt Surepass verification after insert; on failure broker is kept unverified (lenient). */
  verify_bank?: boolean;
  kyc_verification_details?: EntityKycVerificationDetails;
}

export interface UpdateBrokerDTO {
  business_name?: string;
  contact_persons?: ContactPerson[];
  address?: Address;
  business_details?: BusinessDetails;
  bank_details?: BankDetails;
  broker_details?: BrokerDetails;
  type?: BrokerType;
  is_active?: boolean;
  updated_by?: string;
  /** If true, run Surepass verification after update (lenient on failure). */
  verify_bank?: boolean;
  kyc_verification_details?: EntityKycVerificationDetails;
}

export interface BrokerResponse {
  id: string;
  business_name: string | null;
  contact_persons: ContactPerson[];
  address: Address;
  business_details: BusinessDetails;
  bank_details: BankDetails | null;
  broker_details: BrokerDetails | null;
  type: BrokerType;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  bank_details_verified_at: string | null;
  bank_details_verified_by: string | null;
  bank_verification_error: string | null;
  kyc_verification_details: EntityKycVerificationDetails;
}
