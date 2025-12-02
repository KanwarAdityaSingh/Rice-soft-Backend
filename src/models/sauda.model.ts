export type SaudaType = 'xgodown' | 'for';
export type SaudaStatus = 'draft' | 'active' | 'completed' | 'cancelled';

export interface Sauda {
  id: string;
  sauda_type: SaudaType;
  rice_quality: string;
  rice_code_id: string | null;
  rate: number;
  broker_id: string | null;
  broker_commission: number | null;
  quantity: number | null;
  cash_discount: number | null;
  estimated_delivery_time: number | null;
  purchaser_id: string;
  cooked_rice_image_url: string | null;
  uncooked_rice_image_url: string | null;
  status: SaudaStatus;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateSaudaDTO {
  sauda_type: SaudaType;
  rice_quality: string;
  rice_code_id?: string;
  rate: number;
  broker_id?: string;
  broker_commission?: number;
  quantity?: number;
  cash_discount?: number;
  estimated_delivery_time?: number;
  purchaser_id: string;
  cooked_rice_image_url?: string;
  uncooked_rice_image_url?: string;
  status?: SaudaStatus;
  notes?: string;
  created_by?: string;
}

export interface UpdateSaudaDTO {
  sauda_type?: SaudaType;
  rice_quality?: string;
  rice_code_id?: string;
  rate?: number;
  broker_id?: string;
  broker_commission?: number;
  quantity?: number;
  cash_discount?: number;
  estimated_delivery_time?: number;
  purchaser_id?: string;
  cooked_rice_image_url?: string;
  uncooked_rice_image_url?: string;
  status?: SaudaStatus;
  notes?: string;
  updated_by?: string;
}

export interface SaudaResponse {
  id: string;
  sauda_type: SaudaType;
  rice_quality: string;
  rice_code_id: string | null;
  rate: number;
  broker_id: string | null;
  broker_commission: number | null;
  quantity: number | null;
  cash_discount: number | null;
  estimated_delivery_time: number | null;
  purchaser_id: string;
  cooked_rice_image_url: string | null;
  uncooked_rice_image_url: string | null;
  status: SaudaStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

