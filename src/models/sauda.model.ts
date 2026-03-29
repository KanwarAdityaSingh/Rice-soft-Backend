import { RiceType } from './lead.model';
import type { RiceLength } from '../constants/rice-lengths';

export type SaudaType = 'exgodown' | 'for';
export type SaudaStatus = 'draft' | 'active' | 'completed' | 'cancelled';
export type CashDiscountType = 'rupees' | 'percentage';
export type BrokerCommissionType = 'rupees' | 'percentage' | 'weight';

export interface Sauda {
  id: string;
  sauda_type: SaudaType;
  rice_type: RiceType;
  rice_length: RiceLength | null;
  rice_code_id: string | null;
  rate: number;
  broker_id: string | null;
  broker_commission: number | null;
  broker_commission_type: BrokerCommissionType;
  quantity: number | null;
  received_until_now: number;
  completion_percentage: number | null;
  cash_discount: number | null;
  cash_discount_type: CashDiscountType;
  estimated_delivery_time: number | null;
  purchaser_id: string;
  cooked_rice_image_url: string | null;
  uncooked_rice_image_url: string | null;
  status: SaudaStatus;
  notes: string | null;
  is_dana_required: boolean | null;
  sauda_date: Date | string | null; // Can be Date object or string (when using TO_CHAR in SQL)
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateSaudaDTO {
  sauda_type: SaudaType;
  rice_type: RiceType;
  rice_length?: RiceLength | null;
  rice_code_id?: string;
  rate: number;
  broker_id?: string;
  broker_commission?: number;
  broker_commission_type?: BrokerCommissionType;
  quantity?: number;
  cash_discount?: number;
  cash_discount_type?: CashDiscountType;
  estimated_delivery_time?: number;
  purchaser_id: string;
  cooked_rice_image_url?: string;
  uncooked_rice_image_url?: string;
  status?: SaudaStatus;
  notes?: string;
  is_dana_required?: boolean;
  sauda_date?: string | Date;
  created_by?: string;
}

export interface UpdateSaudaDTO {
  sauda_type?: SaudaType;
  rice_type?: RiceType;
  rice_length?: RiceLength | null;
  rice_code_id?: string;
  rate?: number;
  broker_id?: string;
  broker_commission?: number;
  broker_commission_type?: BrokerCommissionType;
  quantity?: number;
  cash_discount?: number;
  cash_discount_type?: CashDiscountType;
  estimated_delivery_time?: number;
  purchaser_id?: string;
  cooked_rice_image_url?: string;
  uncooked_rice_image_url?: string;
  status?: SaudaStatus;
  notes?: string;
  is_dana_required?: boolean;
  sauda_date?: string | Date;
  updated_by?: string;
}

export interface SaudaResponse {
  id: string;
  /** First 4 hex digits of id — use in tables instead of full UUID */
  display_id: string;
  sauda_type: SaudaType;
  rice_type: RiceType;
  rice_length: RiceLength | null;
  rice_code_id: string | null;
  rate: number;
  broker_id: string | null;
  broker_commission: number | null;
  broker_commission_type: BrokerCommissionType;
  quantity: number | null;
  received_until_now: number;
  completion_percentage: number | null;
  cash_discount: number | null;
  cash_discount_type: CashDiscountType;
  estimated_delivery_time: number | null;
  purchaser_id: string;
  cooked_rice_image_url: string | null;
  uncooked_rice_image_url: string | null;
  status: SaudaStatus;
  notes: string | null;
  is_dana_required: boolean | null;
  sauda_date: string | null;
  created_at: string;
  updated_at: string;
}

