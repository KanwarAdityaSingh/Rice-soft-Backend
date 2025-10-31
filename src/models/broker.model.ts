export interface Address {
  street: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

export interface BusinessDetails {
  pan_number?: string;
  aadhaar_number?: string;
  registration_number?: string;
  business_type?: 'individual' | 'partnership' | 'company' | 'llp';
}

export interface BrokerDetails {
  commission_rate?: number; // percentage
  specialization?: string; // rice, wheat, etc.
  experience_years?: number;
}

export type BrokerType = 'purchase' | 'sale' | 'both';

export interface Broker {
  id: string;
  business_name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: Address;
  business_details: BusinessDetails;
  broker_details: BrokerDetails | null;
  type: BrokerType;
  is_active: boolean;
  user_id: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateBrokerDTO {
  business_name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: Address;
  business_details: BusinessDetails;
  broker_details?: BrokerDetails;
  type: BrokerType;
  is_active?: boolean;
  created_by?: string;
  user_id?: string;
}

export interface UpdateBrokerDTO {
  business_name?: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: Address;
  business_details?: BusinessDetails;
  broker_details?: BrokerDetails;
  type?: BrokerType;
  is_active?: boolean;
  updated_by?: string;
}

export interface BrokerResponse {
  id: string;
  business_name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: Address;
  business_details: BusinessDetails;
  broker_details: BrokerDetails | null;
  type: BrokerType;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

