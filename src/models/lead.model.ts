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
  industry?: string;
  company_size?: string;
  annual_revenue?: number;
} 
//gps coordinates, business front image(to be stored in s3)

export type LeadStatus = 'new' | 'contacted' | 'engaged' | 'converted' | 'rejected';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type RiceType = 'basmati' | 'non_basmati' | 'parboiled' | 'raw';

export interface Lead {
  id: string;
  company_name: string;
  contact_person: string;
  email: string;
  phone: string | null;
  address: Address | null;
  business_details: BusinessDetails | null;
  is_existing_customer: boolean;
  lead_status: LeadStatus;
  customer_status: string | null;
  assigned_to: string | null;
  rice_code_id: string;
  rice_type: RiceType;
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
}
//next follow up key and value pair -epoch`

export interface CreateLeadDTO {
  company_name: string;
  contact_person: string;
  email: string;
  phone?: string;
  address?: Address;
  business_details?: BusinessDetails;
  is_existing_customer?: boolean;
  lead_status?: LeadStatus;
  customer_status?: string;
  assigned_to?: string;
  rice_code_id: string;
  rice_type: RiceType;
  created_by?: string;
  notes?: string;
  priority?: Priority;
  source?: string;
  estimated_value?: number;
  expected_close_date?: Date;
  revenue?: number;
}

export interface UpdateLeadDTO {
  company_name?: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: Address;
  business_details?: BusinessDetails;
  is_existing_customer?: boolean;
  lead_status?: LeadStatus;
  customer_status?: string;
  assigned_to?: string;
  rice_code_id?: string;
  rice_type?: RiceType;
  updated_by?: string;
  notes?: string;
  priority?: Priority;
  source?: string;
  estimated_value?: number;
  expected_close_date?: Date;
  revenue?: number;
}

export interface LeadResponse {
  id: string;
  company_name: string;
  contact_person: string;
  email: string;
  phone: string | null;
  address: Address | null;
  business_details: BusinessDetails | null;
  is_existing_customer: boolean;
  lead_status: LeadStatus;
  customer_status: string | null;
  assigned_to: string | null;
  rice_code_id: string;
  rice_type: RiceType;
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
}

export interface LeadAnalytics {
  id: string;
  company_name: string;
  contact_person: string;
  email: string;
  lead_status: LeadStatus;
  priority: Priority;
  estimated_value: number | null;
  created_at: string;
  assigned_salesman: string | null;
  created_by_user: string | null;
  event_count: number;
  actual_status: string;
}
