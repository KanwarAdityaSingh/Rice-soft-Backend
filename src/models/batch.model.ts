export type BatchStatus = 'planned' | 'in_progress' | 'recipe_attached' | 'ready_to_pack' | 'packaged' | 'completed' | 'cancelled';

export interface Batch {
  id: string;
  batch_number: string;
  product_id: string | null; // Nullable for three-stage workflow (set in stage 2)
  recipe_id: string;
  packaging_id: string | null; // Nullable for three-stage workflow (kept for backward compatibility)
  quantity: number; // Total quantity from recipe (stage 1)
  status: BatchStatus;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface BatchProduct {
  id: string;
  batch_id: string;
  product_id: string;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface BatchPackaging {
  id: string;
  batch_id: string;
  product_id: string;
  packaging_id: string;
  quantity: number; // Quantity in kg of this packaging used in batch
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateBatchDTO {
  recipe_id: string;
  quantity: number; // Total quantity in kg for stage 1
  batch_number?: string;
  status?: BatchStatus;
  created_by?: string;
}

export interface CreateBatchProductDTO {
  product_id: string;
  created_by?: string;
}

export interface CreateBatchPackagingDTO {
  product_id: string;
  packaging_id: string;
  quantity: number; // Quantity in kg
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
  product_id: string | null;
  recipe_id: string;
  packaging_id: string | null;
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

