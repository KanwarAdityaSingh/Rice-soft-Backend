export type BatchStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled';

export interface Batch {
  id: string;
  batch_number: string;
  product_id: string;
  recipe_id: string;
  packaging_id: string;
  quantity: number;
  status: BatchStatus;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateBatchDTO {
  product_id: string;
  recipe_id: string;
  packaging_id: string;
  quantity: number;
  batch_number?: string;
  status?: BatchStatus;
  created_by?: string;
}

export interface UpdateBatchDTO {
  status?: BatchStatus;
  quantity?: number;
  updated_by?: string;
}

export interface BatchResponse {
  id: string;
  batch_number: string;
  product_id: string;
  recipe_id: string;
  packaging_id: string;
  quantity: number;
  status: BatchStatus;
  created_at: string;
  updated_at: string;
}

export interface BatchLotUsage {
  id: string;
  batch_id: string;
  lot_id: string;
  quantity_used: number;
  percentage_used: number;
  created_at: string;
  updated_at: string;
}

export interface BatchRiceCodeUsage {
  id: string;
  batch_id: string;
  rice_code_id: string;
  rice_type: string | null;
  total_quantity_used: number;
  created_at: string;
  updated_at: string;
}

export interface BatchWithDetailsResponse extends BatchResponse {
  product?: {
    id: string;
    name: string;
  };
  recipe?: {
    id: string;
    recipe_name: string;
  };
  packaging?: {
    id: string;
    holding_capacity: number;
    packet_type: string;
  };
  lot_usage?: BatchLotUsage[];
  rice_code_usage?: BatchRiceCodeUsage[];
}

