export interface FinishedGoodsInventory {
  id: string;
  godown_id: string;
  product_id: string;
  batch_id: string;
  packaging_id: string;
  no_of_packets: number;
  total_weight: number;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateFinishedGoodsInventoryDTO {
  godown_id?: string;
  product_id: string;
  batch_id: string;
  packaging_id: string;
  no_of_packets: number;
  total_weight: number;
  created_by?: string;
}

export interface FinishedGoodsInventoryResponse {
  id: string;
  godown_id: string;
  product_id: string;
  batch_id: string;
  packaging_id: string;
  no_of_packets: number;
  total_weight: number;
  created_at: string;
  updated_at: string;
}

export interface FinishedGoodsInventoryWithDetailsResponse extends FinishedGoodsInventoryResponse {
  product?: {
    id: string;
    name: string;
  };
  batch?: {
    id: string;
    batch_number: string;
  };
  packaging?: {
    id: string;
    holding_capacity: number;
    packet_type: string;
  };
}

