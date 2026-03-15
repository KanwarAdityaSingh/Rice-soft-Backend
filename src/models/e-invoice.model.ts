export interface EInvoice {
  id: string;
  invoice_dispatch_id: string;
  irn: string;
  acknowledgement_number: string | null;
  ack_date: Date | null;
  qr_code_content: string | null;
  government_response_payload: Record<string, unknown> | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateEInvoiceDTO {
  invoice_dispatch_id: string;
  irn: string;
  acknowledgement_number?: string;
  ack_date?: Date | string;
  qr_code_content?: string;
  government_response_payload?: Record<string, unknown>;
  status?: string;
}
