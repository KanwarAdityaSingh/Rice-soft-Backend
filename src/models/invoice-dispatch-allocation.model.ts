export interface InvoiceDispatchAllocation {
  id: string;
  invoice_dispatch_id: string;
  invoice_dispatch_line_id: string;
  finished_goods_inventory_id: string;
  quantity_deducted: number;
  created_at: Date;
}
