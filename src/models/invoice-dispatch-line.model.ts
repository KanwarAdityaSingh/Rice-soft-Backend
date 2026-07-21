export interface InvoiceDispatchLine {
  id: string;
  invoice_dispatch_id: string;
  sales_sauda_line_id: string | null;
  product_id: string;
  packaging_id: string | null;
  packet_count: number | null;
  quantity: number;
  quantity_unit: string;
  rate: number;
  amount: number;
  created_at: Date;
  updated_at: Date;
}
