export interface PacketsInventory {
  id: string;
  packaging_id: string;
  available_quantity: number;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreatePacketsInventoryDTO {
  packaging_id: string;
  available_quantity: number;
  created_by?: string;
}

export interface UpdatePacketsInventoryDTO {
  available_quantity?: number;
  updated_by?: string;
}

export interface PacketsInventoryResponse {
  id: string;
  packaging_id: string;
  available_quantity: number;
  created_at: string;
  updated_at: string;
}

export interface PacketsInventoryWithDetailsResponse extends PacketsInventoryResponse {
  packaging?: {
    id: string;
    holding_capacity: number;
    packet_type: string;
    source: string | null;
  };
}

