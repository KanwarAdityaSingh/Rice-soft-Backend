export type PackagingWeight = 5 | 10 | 25 | 26 | 30 | 50;

export interface Packaging {
  id: string; // UUID primary key
  packaging_number: string | null; // Sequential number: PACK-001, PACK-002, etc.
  product_id: string;
  holding_capacity: PackagingWeight;
  packet_type: string;
  packaging_vendor_id: string | null;
  ordered_weight: number | null;
  /** Weight of one empty bag (kg). */
  empty_bag_weight_kg: number | null;
  empty_bag_rate_per_kg: number | null;
  empty_bag_gst_percent: number | null;
  /** Snapshot at first stock-in (initial_packets); total kg = count × empty_bag_weight_kg. */
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
  packet_type: string;
  packaging_vendor_id?: string;
  ordered_weight?: number;
  /** Rare: override auto-generated PACK-xxx (usually omitted). */
  packaging_number?: string | null;
  initial_packets?: number; // Optional: initial number of empty packets to add to inventory
  /** Required when initial_packets > 0 — target godown for packets_inventory row */
  godown_id?: string;
  /** Required when initial_packets > 0 — weight of one empty bag (kg). */
  empty_bag_weight_kg?: number;
  /** Required when initial_packets > 0 — purchase rate per kg. */
  empty_bag_rate_per_kg?: number;
  /** Required when initial_packets > 0 — GST % (0–100). */
  empty_bag_gst_percent?: number;
  bill_number?: string | null;
  bill_date?: string | null;
  packaging_bill_url?: string | null;
  created_by?: string;
}

export interface UpdatePackagingDTO {
  holding_capacity?: PackagingWeight;
  packet_type?: string;
  packaging_vendor_id?: string;
  ordered_weight?: number;
  empty_bag_weight_kg?: number | null;
  empty_bag_rate_per_kg?: number | null;
  empty_bag_gst_percent?: number | null;
  bill_number?: string | null;
  bill_date?: string | null;
  packaging_bill_url?: string | null;
  updated_by?: string;
}

/** Per-godown empty-packet stock for this packaging (from `packets_inventory`). */
export interface PackagingGodownInventoryItem {
  godown_id: string;
  godown_name: string;
  available_quantity: number;
}

export interface PackagingResponse {
  id: string; // UUID primary key
  packaging_number: string | null; // Sequential number: PACK-001, PACK-002, etc.
  product_id: string;
  holding_capacity: PackagingWeight;
  packet_type: string;
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
  /** Empty-packet inventory per godown (one row per godown that holds stock). */
  packets_inventory: PackagingGodownInventoryItem[];
}

