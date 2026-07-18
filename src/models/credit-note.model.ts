export type CreditNoteStatus = 'draft' | 'confirmed';

export interface CreditNote {
  id: string;
  invoice_dispatch_id: string;
  sales_sauda_id: string;
  credit_note_number: string;
  credit_note_date: Date | string | null;
  /** Indian FY label Apr–Mar, e.g. 2025-2026 */
  financial_year: string;
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
  financial_year?: string;
  reason?: string;
  lines: Array<{ invoice_dispatch_line_id: string; product_id: string; quantity_returned: number }>;
  created_by?: string;
}
