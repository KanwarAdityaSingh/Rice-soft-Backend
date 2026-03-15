export interface CreditNoteLine {
  id: string;
  credit_note_id: string;
  invoice_dispatch_line_id: string;
  product_id: string;
  quantity_returned: number;
  created_at: Date;
  updated_at: Date;
}
