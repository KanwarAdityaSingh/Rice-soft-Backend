export type PackagingWeight = 5 | 10 | 25 | 26 | 30 | 50;

export type PackagingStatus = 'active' | 'inactive';

export interface Packaging {
  id: string;
  packaging_number: string | null;
  product_id: string;
  holding_capacity: PackagingWeight;
  /** Legacy free-text; kept for sales-safe GET (aliased from material name when needed) */
  packet_type: string;
  packaging_material_id: string;
  packaging_material_name?: string | null;
  remarks: string | null;
  status: PackagingStatus;
  packaging_vendor_id: string | null;
  ordered_weight: number | null;
  empty_bag_weight_kg: number | null;
  empty_bag_rate_per_kg: number | null;
  empty_bag_gst_percent: number | null;
  empty_bags_total_weight_kg: number | null;
  empty_bags_taxable_amount: number | null;
  empty_bags_gst_amount: number | null;
  empty_bags_total_amount: number | null;
  bill_number: string | null;
  bill_date: Date | null;
  packaging_bill_url: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreatePackagingDTO {
  product_id: string;
  holding_capacity: PackagingWeight;
  packaging_material_id: string;
  remarks?: string | null;
  status?: PackagingStatus;
  /** Rare: override auto-generated PACK-xxx */
  packaging_number?: string | null;
  created_by?: string;
}

export interface UpdatePackagingDTO {
  holding_capacity?: PackagingWeight;
  packaging_material_id?: string;
  remarks?: string | null;
  status?: PackagingStatus;
  updated_by?: string;
}

/** Per-godown empty-packet stock for this packaging (from `packets_inventory`). */
export interface PackagingGodownInventoryItem {
  godown_id: string;
  godown_name: string;
  available_quantity: number;
}

export interface PackagingResponse {
  id: string;
  packaging_number: string | null;
  product_id: string;
  holding_capacity: PackagingWeight;
  packet_type: string;
  packaging_material_id: string;
  packaging_material_name: string | null;
  remarks: string | null;
  status: PackagingStatus;
  packaging_vendor_id: string | null;
  ordered_weight: number | null;
  empty_bag_weight_kg: number | null;
  empty_bag_rate_per_kg: number | null;
  empty_bag_gst_percent: number | null;
  empty_bags_total_weight_kg: number | null;
  empty_bags_taxable_amount: number | null;
  empty_bags_gst_amount: number | null;
  empty_bags_total_amount: number | null;
  bill_number: string | null;
  bill_date: string | null;
  packaging_bill_url: string | null;
  created_at: string;
  updated_at: string;
  packets_inventory: PackagingGodownInventoryItem[];
}
