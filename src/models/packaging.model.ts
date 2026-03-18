export type PackagingWeight = 5 | 10 | 25 | 26 | 30 | 50;

export interface Packaging {
  id: string; // UUID primary key
  packaging_number: string | null; // Sequential number: PACK-001, PACK-002, etc.
  product_id: string;
  holding_capacity: PackagingWeight;
  packet_type: string;
  packaging_vendor_id: string | null;
  ordered_weight: number | null;
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
  initial_packets?: number; // Optional: initial number of empty packets to add to inventory
  created_by?: string;
}

export interface UpdatePackagingDTO {
  holding_capacity?: PackagingWeight;
  packet_type?: string;
  packaging_vendor_id?: string;
  ordered_weight?: number;
  updated_by?: string;
}

export interface PackagingResponse {
  id: string; // UUID primary key
  packaging_number: string | null; // Sequential number: PACK-001, PACK-002, etc.
  product_id: string;
  holding_capacity: PackagingWeight;
  packet_type: string;
  packaging_vendor_id: string | null;
  ordered_weight: number | null;
  created_at: string;
  updated_at: string;
}

