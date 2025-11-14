export interface Address {
  street: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

export interface BankDetails {
  bank_name?: string;
  ifsc_code?: string;
  account_number?: string;
  branch?: string;
}

export interface Transporter {
  id: string;
  business_name: string;
  contact_person: string;
  phone: string;
  email: string | null;
  address: Address;
  gst_number: string | null;
  pan_number: string | null;
  vehicle_numbers: string[];
  bank_details: BankDetails;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateTransporterDTO {
  business_name: string;
  contact_person: string;
  phone: string;
  email?: string;
  address: Address;
  gst_number?: string;
  pan_number?: string;
  vehicle_numbers?: string[];
  bank_details?: BankDetails;
  is_active?: boolean;
  created_by?: string;
}

export interface UpdateTransporterDTO {
  business_name?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: Address;
  gst_number?: string;
  pan_number?: string;
  vehicle_numbers?: string[];
  bank_details?: BankDetails;
  is_active?: boolean;
  updated_by?: string;
}

export interface TransporterResponse {
  id: string;
  business_name: string;
  contact_person: string;
  phone: string;
  email: string | null;
  address: Address;
  gst_number: string | null;
  pan_number: string | null;
  vehicle_numbers: string[];
  bank_details: BankDetails;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

