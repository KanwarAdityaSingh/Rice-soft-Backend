export type InwardSlipStatus = 'pending' | 'completed';

export interface InwardSlipPass {
  id: string;
  slip_number: string;
  date: Date;
  vehicle_id: string | null;
  party_name: string;
  party_address: string | null;
  party_gst_number: string | null;
  party_pan_number: string | null;
  transporter_id: string | null;
  transportation_cost: number | null;
  status: InwardSlipStatus;
  inward_slip_bill_image_url: string | null;
  transportation_bill_image_url: string | null;
  bill_pdf_url: string | null;
  bilti_image_url: string | null;
  bilti_pdf_url: string | null; 
  eway_bill_number: string | null;
  eway_bill_url: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateInwardSlipPassDTO {
  sauda_ids?: string[]; // Array of sauda IDs to link
  slip_number?: string; // Optional - auto-generated as ISP-001, ISP-002, etc. if not provided
  date: string; // ISO date string
  vehicle_id: string;
  party_name: string;
  party_address?: string;
  party_gst_number?: string;
  party_pan_number?: string;
  transporter_id?: string;
  transportation_cost?: number;
  status?: InwardSlipStatus;
  inward_slip_bill_image_url?: string;
  transportation_bill_image_url?: string;
  bill_pdf_url?: string;
  bilti_image_url?: string;
  bilti_pdf_url?: string;
  eway_bill_number?: string;
  eway_bill_url?: string;
  notes?: string;
  created_by?: string;
}

export interface UpdateInwardSlipPassDTO {
  sauda_ids?: string[]; // Array of sauda IDs to link (replaces existing links)
  slip_number?: string;
  date?: string;
  vehicle_id?: string;
  party_name?: string;
  party_address?: string;
  party_gst_number?: string;
  party_pan_number?: string;
  transporter_id?: string;
  transportation_cost?: number;
  status?: InwardSlipStatus;
  inward_slip_bill_image_url?: string;
  transportation_bill_image_url?: string;
  bill_pdf_url?: string;
  bilti_image_url?: string;
  bilti_pdf_url?: string;
  eway_bill_number?: string;
  eway_bill_url?: string;
  notes?: string;
  updated_by?: string;
}

export interface InwardSlipPassResponse {
  id: string;
  sauda_ids: string[]; // Array of linked sauda IDs
  slip_number: string;
  date: string;
  vehicle_id: string | null;
  party_name: string;
  party_address: string | null;
  party_gst_number: string | null;
  party_pan_number: string | null;
  transporter_id: string | null;
  transportation_cost: number | null;
  status: InwardSlipStatus;
  inward_slip_bill_image_url: string | null;
  transportation_bill_image_url: string | null;
  bill_pdf_url: string | null;
  bilti_image_url: string | null;
  bilti_pdf_url: string | null;
  eway_bill_number: string | null;
  eway_bill_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

