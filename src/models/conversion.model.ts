export interface Conversion {
  id: string;
  lead_id: string;
  vendor_id: string;
  broker_id: string | null;
  conversion_date: Date;
  conversion_value: number | null;
  commission_rate: number | null;
  commission_amount: number | null;
  created_by: string | null;
  notes: string | null;
}

export interface CreateConversionDTO {
  lead_id: string;
  vendor_id: string;
  broker_id?: string;
  conversion_value?: number;
  commission_rate?: number;
  commission_amount?: number;
  created_by?: string;
  notes?: string;
}

export interface UpdateConversionDTO {
  conversion_value?: number;
  commission_rate?: number;
  commission_amount?: number;
  notes?: string;
}

export interface ConversionResponse {
  id: string;
  lead_id: string;
  vendor_id: string;
  broker_id: string | null;
  conversion_date: string;
  conversion_value: number | null;
  commission_rate: number | null;
  commission_amount: number | null;
  created_by: string | null;
  notes: string | null;
}

export interface ConversionWithDetails {
  id: string;
  lead_id: string;
  vendor_id: string;
  broker_id: string | null;
  conversion_date: string;
  conversion_value: number | null;
  commission_rate: number | null;
  commission_amount: number | null;
  created_by: string | null;
  notes: string | null;
  // Additional details
  lead_company_name: string;
  vendor_business_name: string;
  broker_business_name: string | null;
  created_by_username: string | null;
}
