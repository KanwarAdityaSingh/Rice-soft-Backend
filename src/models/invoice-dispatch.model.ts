export type InvoiceDispatchStatus = 'draft' | 'confirmed';

export interface InvoiceDispatch {
  id: string;
  sales_sauda_id: string;
  godown_id: string;
  internal_invoice_number: string;
  dispatch_date: Date | string | null;
  /** Indian FY label Apr–Mar, e.g. 2025-2026 */
  financial_year: string;
  party_name: string;
  party_address: string | null;
  party_gst_number: string | null;
  party_pan_number: string | null;
  transporter_id: string | null;
  vehicle_id: string | null;
  /** Lorry Receipt / transporter document number */
  lr_number: string | null;
  transportation_cost: number | null;
  distance_km: number | null;
  route_description: string | null;
  usp: string | null;
  bilti_image_url: string | null;
  bilti_pdf_url: string | null;
  status: InvoiceDispatchStatus;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface UpdateInvoiceDispatchDTO {
  bilti_image_url?: string | null;
  bilti_pdf_url?: string | null;
  transportation_cost?: number | null;
  lr_number?: string | null;
  updated_by?: string;
}

export interface CreateInvoiceDispatchDTO {
  sales_sauda_id: string;
  godown_id: string;
  internal_invoice_number: string;
  dispatch_date?: string | Date;
  financial_year?: string;
  party_name: string;
  party_address?: string | null;
  party_gst_number?: string | null;
  party_pan_number?: string | null;
  transporter_id?: string;
  vehicle_id?: string;
  lr_number?: string | null;
  transportation_cost?: number | null;
  distance_km?: number;
  route_description?: string;
  usp?: string | null;
  created_by?: string;
}

export interface InvoiceDispatchResponse {
  id: string;
  sales_sauda_id: string;
  godown_id: string;
  internal_invoice_number: string;
  dispatch_date: string | null;
  financial_year: string;
  party_name: string;
  party_address: string | null;
  party_gst_number: string | null;
  party_pan_number: string | null;
  transporter_id: string | null;
  vehicle_id: string | null;
  lr_number: string | null;
  transportation_cost: number | null;
  distance_km: number | null;
  route_description: string | null;
  usp: string | null;
  bilti_image_url: string | null;
  bilti_pdf_url: string | null;
  status: InvoiceDispatchStatus;
  created_at: string;
  updated_at: string;
}
