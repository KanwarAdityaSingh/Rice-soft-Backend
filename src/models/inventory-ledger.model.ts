export type InventoryLedgerSourceType = 'purchase_inward' | 'sales_dispatch' | 'sale_return' | 'adjustment';

export interface InventoryLedgerEntry {
  id: string;
  godown_id: string;
  product_id: string;
  quantity_change: number;
  source_type: InventoryLedgerSourceType;
  source_id: string | null;
  stock_before: number;
  stock_after: number;
  reference_type: string | null;
  reference_id: string | null;
  batch_id: string | null;
  packaging_id: string | null;
  created_at: Date;
  created_by: string | null;
}

export interface CreateInventoryLedgerDTO {
  godown_id: string;
  product_id: string;
  quantity_change: number;
  source_type: InventoryLedgerSourceType;
  source_id?: string;
  stock_before: number;
  stock_after: number;
  reference_type?: string;
  reference_id?: string;
  batch_id?: string;
  packaging_id?: string;
  created_by?: string;
}
