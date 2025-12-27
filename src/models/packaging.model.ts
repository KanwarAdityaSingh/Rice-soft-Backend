export type PackagingWeight = 10 | 25 | 50;

export interface Packaging {
  id: string;
  product_id: string;
  holding_capacity: PackagingWeight;
  packet_type: string;
  source: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreatePackagingDTO {
  product_id: string;
  holding_capacity: PackagingWeight;
  packet_type: string;
  source?: string;
  created_by?: string;
}

export interface UpdatePackagingDTO {
  holding_capacity?: PackagingWeight;
  packet_type?: string;
  source?: string;
  updated_by?: string;
}

export interface PackagingResponse {
  id: string;
  product_id: string;
  holding_capacity: PackagingWeight;
  packet_type: string;
  source: string | null;
  created_at: string;
  updated_at: string;
}

