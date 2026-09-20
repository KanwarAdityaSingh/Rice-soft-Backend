export interface PackagingMaterialPurchase {
  id: string;
  vendor_id: string;
  packaging_id: string;
  serial_number: number;
  purchase_date: Date | string;
  invoice_number: string;
  invoice_date: Date | string;
  quantity_kg: number;
  empty_bag_weight_kg: number;
  gsm: number | null;
  rate_per_kg: number;
  gst_percent: number;
  bag_count: number;
  rate_per_bag: number;
  taxable_amount: number;
  gst_amount: number;
  total_amount: number;
  godown_id: string;
  batch_lot_number: string | null;
  invoice_document_url: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreatePackagingMaterialPurchaseDTO {
  vendor_id: string;
  packaging_id: string;
  purchase_date: string;
  invoice_number: string;
  invoice_date: string;
  quantity_kg: number;
  empty_bag_weight_kg: number;
  gsm?: number | null;
  rate_per_kg: number;
  gst_percent: number;
  godown_id: string;
  batch_lot_number?: string | null;
  invoice_document_url?: string | null;
  notes?: string | null;
  created_by?: string;
}

/** Partial patch. serial_number and derived amounts are not client-writable. */
export interface UpdatePackagingMaterialPurchaseDTO {
  vendor_id?: string;
  packaging_id?: string;
  purchase_date?: string;
  invoice_number?: string;
  invoice_date?: string;
  quantity_kg?: number;
  empty_bag_weight_kg?: number;
  gsm?: number | null;
  rate_per_kg?: number;
  gst_percent?: number;
  godown_id?: string;
  batch_lot_number?: string | null;
  invoice_document_url?: string | null;
  notes?: string | null;
  updated_by?: string;
}

export interface PackagingMaterialPurchaseResponse {
  id: string;
  vendor_id: string;
  packaging_id: string;
  serial_number: number;
  purchase_date: string;
  invoice_number: string;
  invoice_date: string;
  quantity_kg: number;
  empty_bag_weight_kg: number;
  gsm: number | null;
  rate_per_kg: number;
  gst_percent: number;
  bag_count: number;
  rate_per_bag: number;
  taxable_amount: number;
  gst_amount: number;
  total_amount: number;
  godown_id: string;
  batch_lot_number: string | null;
  invoice_document_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function toDateString(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

export function toPackagingMaterialPurchaseResponse(
  row: PackagingMaterialPurchase
): PackagingMaterialPurchaseResponse {
  return {
    id: row.id,
    vendor_id: row.vendor_id,
    packaging_id: row.packaging_id,
    serial_number: Number(row.serial_number),
    purchase_date: toDateString(row.purchase_date),
    invoice_number: row.invoice_number,
    invoice_date: toDateString(row.invoice_date),
    quantity_kg: Number(row.quantity_kg),
    empty_bag_weight_kg: Number(row.empty_bag_weight_kg),
    gsm: row.gsm != null ? Number(row.gsm) : null,
    rate_per_kg: Number(row.rate_per_kg),
    gst_percent: Number(row.gst_percent),
    bag_count: Number(row.bag_count),
    rate_per_bag: Number(row.rate_per_bag),
    taxable_amount: Number(row.taxable_amount),
    gst_amount: Number(row.gst_amount),
    total_amount: Number(row.total_amount),
    godown_id: row.godown_id,
    batch_lot_number: row.batch_lot_number,
    invoice_document_url: row.invoice_document_url,
    notes: row.notes,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
