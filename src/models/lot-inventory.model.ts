export interface LotInventory {
  id: string;
  lot_id: string;
  available_quantity: number;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateLotInventoryDTO {
  lot_id: string;
  available_quantity: number;
  created_by?: string;
}

export interface UpdateLotInventoryDTO {
  available_quantity?: number;
  updated_by?: string;
}

export interface LotInventoryResponse {
  id: string;
  lot_id: string;
  available_quantity: number;
  created_at: string;
  updated_at: string;
}

export interface LotInventoryWithDetailsResponse extends LotInventoryResponse {
  lot?: {
    id: string;
    lot_number: string;
    rice_code_id: string | null;
    rice_type: string | null;
    received_weight: number;
  };
}

