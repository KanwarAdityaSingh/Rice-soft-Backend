export type CreditNoteStatus = 'draft' | 'confirmed';

export interface CreditNote {
  id: string;
  invoice_dispatch_id: string;
  sales_sauda_id: string;
  credit_note_number: string;
  credit_note_date: Date | string | null;
  status: CreditNoteStatus;
  reason: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateCreditNoteDTO {
  invoice_dispatch_id: string;
  sales_sauda_id: string;
  credit_note_number: string;
  credit_note_date?: string | Date;
  reason?: string;
  lines: Array<{ invoice_dispatch_line_id: string; product_id: string; quantity_returned: number }>;
  created_by?: string;
}
