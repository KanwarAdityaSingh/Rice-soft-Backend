export type InvoiceDispatchStatus = 'draft' | 'confirmed' | 'cancelled';

/** Lean driver payload nested on invoice dispatch responses */
export interface InvoiceDispatchDriverSummary {
  id: string;
  name: string | null;
  phone: string;
  license_number: string;
  license_expires_at: string | null;
  transport_license_expires_at: string | null;
  father_or_husband_name: string | null;
  state: string | null;
  city_name: string | null;
  address: string | null;
  pincode: string | null;
  is_verified: boolean;
  is_active: boolean;
}

export interface InvoiceDispatch {
  id: string;
  /** Primary / first linked sales sauda (backward compatible) */
  sales_sauda_id: string;
  /** All linked sales sauda ids when loaded via service/controller */
  sales_sauda_ids?: string[];
  godown_id: string;
  /** Destination godown for godown_transfer; null for normal sales */
  to_godown_id: string | null;
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
  /** Optional link to drivers master */
  driver_id: string | null;
  /** Lorry Receipt / transporter document number */
  lr_number: string | null;
  transportation_cost: number | null;
  distance_km: number | null;
  route_description: string | null;
  usp: string | null;
  bilti_image_url: string | null;
  bilti_pdf_url: string | null;
  lr_image_url: string | null;
  lr_pdf_url: string | null;
  receiving_doc_image_url: string | null;
  receiving_doc_pdf_url: string | null;
  status: InvoiceDispatchStatus;
  cancel_reason: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface UpdateInvoiceDispatchDTO {
  dispatch_date?: string | Date | null;
  transporter_id?: string | null;
  vehicle_id?: string | null;
  driver_id?: string | null;
  lr_number?: string | null;
  transportation_cost?: number | null;
  distance_km?: number | null;
  route_description?: string | null;
  usp?: string | null;
  bilti_image_url?: string | null;
  bilti_pdf_url?: string | null;
  lr_image_url?: string | null;
  lr_pdf_url?: string | null;
  receiving_doc_image_url?: string | null;
  receiving_doc_pdf_url?: string | null;
  cancel_reason?: string | null;
  updated_by?: string;
}

export interface CreateInvoiceDispatchDTO {
  sales_sauda_id: string;
  godown_id: string;
  to_godown_id?: string | null;
  internal_invoice_number: string;
  dispatch_date?: string | Date;
  financial_year?: string;
  party_name: string;
  party_address?: string | null;
  party_gst_number?: string | null;
  party_pan_number?: string | null;
  transporter_id?: string;
  vehicle_id?: string;
  driver_id?: string;
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
  sales_sauda_ids: string[];
  godown_id: string;
  to_godown_id: string | null;
  internal_invoice_number: string;
  dispatch_date: string | null;
  financial_year: string;
  party_name: string;
  party_address: string | null;
  party_gst_number: string | null;
  party_pan_number: string | null;
  transporter_id: string | null;
  vehicle_id: string | null;
  driver_id: string | null;
  /** Nested driver summary when driver_id is set (get/list) */
  driver?: InvoiceDispatchDriverSummary | null;
  lr_number: string | null;
  transportation_cost: number | null;
  distance_km: number | null;
  route_description: string | null;
  usp: string | null;
  bilti_image_url: string | null;
  bilti_pdf_url: string | null;
  lr_image_url: string | null;
  lr_pdf_url: string | null;
  receiving_doc_image_url: string | null;
  receiving_doc_pdf_url: string | null;
  status: InvoiceDispatchStatus;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
}
