export interface InvoiceDispatchLine {
  id: string;
  invoice_dispatch_id: string;
  sales_sauda_line_id: string | null;
  product_id: string | null;
  /** Snapshot from sauda line; used for e-invoice / e-way product description */
  product_alias: string | null;
  lot_id: string | null;
  packaging_id: string | null;
  packet_count: number | null;
  no_of_bags: number | null;
  bag_weight: number | null;
  quantity: number;
  quantity_unit: string;
  rate: number;
  amount: number;
  created_at: Date;
  updated_at: Date;
}
