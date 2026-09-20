/**
 * Master Vendor — packaging supplier master (evolved from packaging_vendors).
 * Mirrors sales party KYC shape with enhancements (status, financials, consumer type).
 * Independent from the purchase `vendors` module.
 */
import type {
  Address,
  ContactPerson,
  BusinessDetails,
  BankDetails,
} from './vendor.model';
import type { EntityKycVerificationDetails } from './kyc-verification.model';

export type { Address, ContactPerson, BusinessDetails, BankDetails };

/** Registered Business / Unregistered Business / Consumer */
export type MasterVendorRegistrationType = 'registered' | 'unregistered' | 'consumer';

export type MasterVendorStatus = 'active' | 'inactive' | 'blacklisted';

export interface MasterVendor {
  id: string;
  /** Master Vendor Name */
  business_name: string;
  /**
   * Legacy column kept in sync with business_name for older packaging readers.
   * Prefer business_name in API responses.
   */
  name: string;
  contact_persons: ContactPerson[];
  address: Address;
  /** @deprecated Prefer business_details.gst_number — kept for read backfill */
  gst_number: string | null;
  business_details: BusinessDetails;
  bank_details: BankDetails | null;
  registration_type: MasterVendorRegistrationType;
  status: MasterVendorStatus;
  is_active: boolean;
  is_verified: boolean;
  verified_at: Date | null;
  kyc_verification_details: EntityKycVerificationDetails;
  credit_period_days: number | null;
  credit_limit: number | null;
  opening_balance: number | null;
  address_locked: boolean;
  google_location_link: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateMasterVendorDTO {
  business_name: string;
  /** @deprecated Accepted as alias for business_name */
  name?: string;
  contact_persons: ContactPerson[];
  address: Address;
  business_details: BusinessDetails;
  /** @deprecated Prefer business_details.gst_number */
  gst_number?: string;
  registration_type: MasterVendorRegistrationType;
  bank_details?: BankDetails;
  status?: MasterVendorStatus;
  is_active?: boolean;
  is_verified?: boolean;
  verified_at?: string | null;
  kyc_verification_details?: EntityKycVerificationDetails;
  credit_period_days?: number | null;
  credit_limit?: number | null;
  opening_balance?: number | null;
  address_locked?: boolean;
  google_location_link?: string | null;
  created_by?: string;
}

export interface UpdateMasterVendorDTO {
  business_name?: string;
  /** @deprecated Accepted as alias for business_name */
  name?: string;
  contact_persons?: ContactPerson[];
  address?: Address;
  business_details?: BusinessDetails;
  gst_number?: string;
  registration_type?: MasterVendorRegistrationType;
  bank_details?: BankDetails;
  status?: MasterVendorStatus;
  is_active?: boolean;
  is_verified?: boolean;
  verified_at?: string | null;
  kyc_verification_details?: EntityKycVerificationDetails;
  credit_period_days?: number | null;
  credit_limit?: number | null;
  opening_balance?: number | null;
  address_locked?: boolean;
  /** When address_locked, allow address change (admin FE responsibility). */
  force_address_update?: boolean;
  google_location_link?: string | null;
  updated_by?: string;
}

export interface MasterVendorResponse {
  id: string;
  business_name: string;
  /** Alias of business_name for older packaging UI */
  name: string;
  contact_persons: ContactPerson[];
  address: Address;
  gst_number: string | null;
  business_details: BusinessDetails;
  bank_details: BankDetails | null;
  registration_type: MasterVendorRegistrationType;
  status: MasterVendorStatus;
  is_active: boolean;
  is_verified: boolean;
  verified_at: string | null;
  kyc_verification_details: EntityKycVerificationDetails;
  credit_period_days: number | null;
  credit_limit: number | null;
  opening_balance: number | null;
  address_locked: boolean;
  google_location_link: string | null;
  created_at: string;
  updated_at: string;
}

/** @deprecated Use MasterVendor — kept for import compatibility */
export type PackagingVendor = MasterVendor;
export type CreatePackagingVendorDTO = CreateMasterVendorDTO;
export type UpdatePackagingVendorDTO = UpdateMasterVendorDTO;
export type PackagingVendorResponse = MasterVendorResponse;
