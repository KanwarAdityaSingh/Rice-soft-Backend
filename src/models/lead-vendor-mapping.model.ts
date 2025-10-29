export interface LeadVendorMapping {
  id: string;
  lead_id: string;
  vendor_id: string;
  converted_at: Date;
  conversion_value: number | null;
  created_by: string | null;
}

export interface CreateLeadVendorMappingDTO {
  lead_id: string;
  vendor_id: string;
  conversion_value?: number;
  created_by?: string;
}

