/**
 * Sales Party model — same structure as Vendor except no type (sales-side customers; always buyer).
 * Shared types (Address, ContactPerson, etc.) are imported from vendor.model.
 */
import type {
  Address,
  ContactPerson,
  BusinessDetails,
  BankDetails,
} from './vendor.model';
import type { EntityKycVerificationDetails } from './kyc-verification.model';

export type { Address, ContactPerson, BusinessDetails, BankDetails };

export type SalesPartyRegistrationType = 'registered' | 'unregistered';

export interface SalesParty {
  id: string;
  business_name: string;
  contact_persons: ContactPerson[];
  contact_person: string;
  email: string | null;
  phone: string;
  address: Address;
  business_details: BusinessDetails;
  aadhar_number: string | null;
  registration_type: SalesPartyRegistrationType;
  bank_details: BankDetails | null;
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
  kyc_verification_details: EntityKycVerificationDetails;
}

export interface CreateSalesPartyDTO {
  business_name: string;
  contact_persons: ContactPerson[];
  address: Address;
  business_details: BusinessDetails;
  aadhar_number?: string;
  registration_type: SalesPartyRegistrationType;
  bank_details?: BankDetails;
  is_active?: boolean;
  is_verified?: boolean;
  verified_at?: string | null;
  created_by?: string;
  user_id?: string;
  lead_id?: string;
  google_location_link?: string;
  business_card_url?: string;
  kyc_verification_details?: EntityKycVerificationDetails;
}

export interface UpdateSalesPartyDTO {
  business_name?: string;
  contact_persons?: ContactPerson[];
  address?: Address;
  business_details?: BusinessDetails;
  aadhar_number?: string;
  registration_type?: SalesPartyRegistrationType;
  bank_details?: BankDetails;
  is_active?: boolean;
  is_verified?: boolean;
  verified_at?: string | null;
  lead_id?: string;
  updated_by?: string;
  google_location_link?: string;
  business_card_url?: string;
  kyc_verification_details?: EntityKycVerificationDetails;
}

export interface SalesPartyResponse {
  id: string;
  business_name: string;
  contact_persons: ContactPerson[];
  address: Address;
  business_details: BusinessDetails;
  aadhar_number: string | null;
  registration_type: SalesPartyRegistrationType;
  bank_details: BankDetails | null;
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
  kyc_verification_details: EntityKycVerificationDetails;
}
