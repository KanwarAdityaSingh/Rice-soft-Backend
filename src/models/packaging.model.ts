export interface Packaging {
  id: string;
  holding_capacity: number;
  packet_type: string;
  source: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreatePackagingDTO {
  holding_capacity: number;
  packet_type: string;
  source?: string;
  created_by?: string;
}

export interface UpdatePackagingDTO {
  holding_capacity?: number;
  packet_type?: string;
  source?: string;
  updated_by?: string;
}

export interface PackagingResponse {
  id: string;
  holding_capacity: number;
  packet_type: string;
  source: string | null;
  created_at: string;
  updated_at: string;
}

