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
  industry?: string;
  company_size?: string;
  annual_revenue?: number;
} 
//gps coordinates, business front image(to be stored in s3)

export type LeadStatus = 'new' | 'contacted' | 'engaged' | 'converted' | 'rejected';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type RiceType = 'basmati' | 'non_basmati' | 'parboiled' | 'raw' | 'raw_basmati' | 'steam_basmati' | 'white_sella' | 'golden_sella';

export interface Lead {
  id: string;
  company_name: string;
  contact_persons: ContactPerson[];
  email: string | null;
  phone: string | null;
  address: Address | null;
  business_details: BusinessDetails | null;
  is_existing_customer: boolean;
  lead_status: LeadStatus;
  customer_status: string | null;
  assigned_to: string | null;
  broker_id: string | null;
  rice_code_id: string | null;
  rice_type: RiceType | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
  notes: string | null;
  priority: Priority;
  source: string | null;
  estimated_value: number | null;
  expected_close_date: Date | null;
  revenue: number | null;
  salesman_latitude: number | null;
  salesman_longitude: number | null;
  google_location_link: string | null;
}
//next follow up key and value pair -epoch`

export interface CreateLeadDTO {
  company_name: string;
  contact_persons: ContactPerson[];
  email?: string;
  phone?: string;
  address?: Address;
  business_details?: BusinessDetails;
  is_existing_customer?: boolean;
  lead_status?: LeadStatus;
  customer_status?: string;
  assigned_to?: string;
  broker_id?: string;
  rice_code_id?: string;
  rice_type?: RiceType;
  created_by?: string;
  notes?: string;
  priority?: Priority;
  source?: string;
  estimated_value?: number;
  expected_close_date?: Date;
  revenue?: number;
  salesman_latitude?: number;
  salesman_longitude?: number;
  google_location_link?: string;
}

export interface UpdateLeadDTO {
  company_name?: string;
  contact_persons?: ContactPerson[];
  email?: string;
  phone?: string;
  address?: Address;
  business_details?: BusinessDetails;
  is_existing_customer?: boolean;
  lead_status?: LeadStatus;
  customer_status?: string;
  assigned_to?: string;
  broker_id?: string;
  rice_code_id?: string;
  rice_type?: RiceType;
  updated_by?: string;
  notes?: string;
  priority?: Priority;
  source?: string;
  estimated_value?: number;
  expected_close_date?: Date;
  revenue?: number;
  salesman_latitude?: number;
  salesman_longitude?: number;
  google_location_link?: string;
}

export interface LeadResponse {
  id: string;
  company_name: string;
  contact_persons: ContactPerson[];
  email: string | null;
  phone: string | null;
  address: Address | null;
  business_details: BusinessDetails | null;
  is_existing_customer: boolean;
  lead_status: LeadStatus;
  customer_status: string | null;
  assigned_to: string | null;
  broker_id: string | null;
  rice_code_id: string | null;
  rice_type: RiceType | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  notes: string | null;
  priority: Priority;
  source: string | null;
  estimated_value: number | null;
  expected_close_date: string | null;
  revenue: number | null;
  salesman_latitude: number | null;
  salesman_longitude: number | null;
  google_location_link: string | null;
}

export interface LeadAnalytics {
  id: string;
  company_name: string;
  contact_persons: ContactPerson[];
  email: string | null;
  lead_status: LeadStatus;
  priority: Priority;
  estimated_value: number | null;
  created_at: string;
  assigned_salesman: string | null;
  created_by_user: string | null;
  event_count: number;
  actual_status: string;
}
