import { RiceType } from './lead.model';
import type { RiceCategory } from '../constants/rice-categories';

export interface InwardSlipLot {
  id: string;
  sauda_id: string;
  godown_id: string;
  lot_number: string;
  rice_category: RiceCategory;
  rice_code_id: string | null;
  rice_type: RiceType;
  rice_length_id: string | null;
  no_of_bags: number;
  bag_weight: number | null;
  total_weight: number | null;
  bill_weight: number;
  received_weight: number;
  rate: number;
  amount: number | null;
  inward_slip_pass_created_at: Date | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateInwardSlipLotDTO {
  sauda_id: string;
  godown_id: string;
  lot_number: string;
  rice_category: RiceCategory;
  rice_code_id: string | null;
  rice_type: RiceType;
  rice_length_id: string | null;
  no_of_bags: number;
  bag_weight?: number;
  bill_weight: number;
  received_weight: number;
  rate: number;
  inward_slip_pass_created_at?: Date | null;
  created_by?: string;
}

export interface UpdateInwardSlipLotDTO {
  godown_id?: string;
  lot_number?: string;
  no_of_bags?: number;
  bag_weight?: number;
  bill_weight?: number;
  received_weight?: number;
  rate?: number;
  updated_by?: string;
}

export interface InwardSlipLotResponse {
  id: string;
  sauda_id: string;
  godown_id: string;
  lot_number: string;
  rice_category: RiceCategory;
  rice_code_id: string | null;
  rice_type: RiceType;
  rice_length_id: string | null;
  no_of_bags: number;
  bag_weight: number | null;
  total_weight: number | null;
  bill_weight: number;
  received_weight: number;
  rate: number;
  amount: number | null;
  inward_slip_pass_created_at: string | null;
  created_at: string;
  updated_at: string;
}
