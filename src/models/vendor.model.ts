export interface Address {
  street: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
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

export interface Vendor {
  id: string;
  business_name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: Address;
  business_details: BusinessDetails;
  bank_details: BankDetails | null;
  type: VendorType;
  is_active: boolean;
  user_id: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
  last_enquiry_date: Date | null;
}


export interface CreateVendorDTO {
  business_name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: Address;
  business_details: BusinessDetails;
  bank_details?: BankDetails;
  type: VendorType;
  is_active?: boolean;
  created_by?: string;
  user_id?: string;
  lead_id?: string;
}

export interface UpdateVendorDTO {
  business_name?: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: Address;
  business_details?: BusinessDetails;
  bank_details?: BankDetails;
  type?: VendorType;
  is_active?: boolean;
  lead_id?: string;
  updated_by?: string;
}

export interface VendorResponse {
  id: string;
  business_name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: Address;
  business_details: BusinessDetails;
  bank_details: BankDetails | null;
  type: VendorType;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_enquiry_date: string | null;
}

