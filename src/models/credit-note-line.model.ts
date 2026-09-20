import type { SalesSaudaDiscountType } from './sales-sauda-line.model';

export interface CreditNoteLine {
  id: string;
  credit_note_id: string;
  invoice_dispatch_line_id: string;
  product_id: string | null;
  product_alias: string | null;
  brand: string | null;
  hsn_code: string | null;
  quantity_returned: number;
  quantity_credited: number;
  quantity_invoiced: number | null;
  quantity_actual_returned: number | null;
  quantity_verified: number | null;
  quantity_short: number | null;
  original_rate: number | null;
  corrected_rate: number | null;
  credit_taxable_input: number | null;
  rate: number | null;
  gst_percent: number | null;
  discount_value: number | null;
  discount_type: SalesSaudaDiscountType | null;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  final_amount: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateCreditNoteLineDTO {
  credit_note_id: string;
  invoice_dispatch_line_id: string;
  product_id?: string | null;
  product_alias?: string | null;
  brand?: string | null;
  hsn_code?: string | null;
  quantity_returned: number;
  quantity_credited: number;
  quantity_invoiced?: number | null;
  quantity_actual_returned?: number | null;
  quantity_verified?: number | null;
  quantity_short?: number | null;
  original_rate?: number | null;
  corrected_rate?: number | null;
  credit_taxable_input?: number | null;
  rate?: number | null;
  gst_percent?: number | null;
  discount_value?: number | null;
  discount_type?: SalesSaudaDiscountType | null;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  final_amount: number;
}
