export type InvoiceDispatchStatus = 'draft' | 'confirmed';

export interface InvoiceDispatch {
  id: string;
  sales_sauda_id: string;
  godown_id: string;
  internal_invoice_number: string;
  dispatch_date: Date | string | null;
  party_name: string;
  party_address: string | null;
  party_gst_number: string | null;
  party_pan_number: string | null;
  transporter_id: string | null;
  vehicle_id: string | null;
  distance_km: number | null;
  route_description: string | null;
  status: InvoiceDispatchStatus;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateInvoiceDispatchDTO {
  sales_sauda_id: string;
  godown_id: string;
  internal_invoice_number: string;
  dispatch_date?: string | Date;
  party_name: string;
  party_address?: string | null;
  party_gst_number?: string | null;
  party_pan_number?: string | null;
  transporter_id?: string;
  vehicle_id?: string;
  distance_km?: number;
  route_description?: string;
  created_by?: string;
}

export interface InvoiceDispatchResponse {
  id: string;
  sales_sauda_id: string;
  godown_id: string;
  internal_invoice_number: string;
  dispatch_date: string | null;
  party_name: string;
  party_address: string | null;
  party_gst_number: string | null;
  party_pan_number: string | null;
  transporter_id: string | null;
  vehicle_id: string | null;
  distance_km: number | null;
  route_description: string | null;
  status: InvoiceDispatchStatus;
  created_at: string;
  updated_at: string;
}
