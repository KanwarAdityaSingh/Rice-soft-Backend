import { RiceType } from './lead.model';

export interface InwardSlipLot {
  id: string;
  sauda_id: string;
  godown_id: string;
  lot_number: string;
  rice_code_id: string | null;
  rice_type: RiceType | null;
  no_of_bags: number;
  bag_weight: number | null;
  total_weight: number | null;
  bill_weight: number;
  received_weight: number;
  rate: number;
  amount: number | null;
  /** Mirrors inward_slip_passes.created_at when lot came from kaanta; null for manual lots */
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
  rice_code_id?: string;
  rice_type?: RiceType;
  no_of_bags: number;
  bag_weight?: number;
  bill_weight: number;
  received_weight: number;
  rate: number;
  /** If set (e.g. kaanta flow), stored on insert; otherwise null */
  inward_slip_pass_created_at?: Date | null;
  created_by?: string;
}

export interface UpdateInwardSlipLotDTO {
  godown_id?: string;
  lot_number?: string;
  rice_code_id?: string;
  rice_type?: RiceType;
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
  rice_code_id: string | null;
  rice_type: RiceType | null;
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

