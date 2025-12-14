import { RiceType } from './lead.model';

export interface InwardSlipLot {
  id: string;
  sauda_id: string;
  lot_number: string;
  rice_code_id: string | null;
  rice_type: RiceType | null;
  no_of_bags: number;
  bag_weight: number | null;
  total_weight: number | null;
  bill_weight: number;
  received_weight: number;
  bardana: string | null;
  rate: number;
  amount: number | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateInwardSlipLotDTO {
  sauda_id: string;
  lot_number: string;
  rice_code_id?: string;
  rice_type?: RiceType;
  no_of_bags: number;
  bag_weight?: number;
  bill_weight: number;
  received_weight: number;
  bardana?: string;
  rate: number;
  created_by?: string;
}

export interface UpdateInwardSlipLotDTO {
  lot_number?: string;
  rice_code_id?: string;
  rice_type?: RiceType;
  no_of_bags?: number;
  bag_weight?: number;
  bill_weight?: number;
  received_weight?: number;
  bardana?: string;
  rate?: number;
  updated_by?: string;
}

export interface InwardSlipLotResponse {
  id: string;
  sauda_id: string;
  lot_number: string;
  rice_code_id: string | null;
  rice_type: RiceType | null;
  no_of_bags: number;
  bag_weight: number | null;
  total_weight: number | null;
  bill_weight: number;
  received_weight: number;
  bardana: string | null;
  rate: number;
  amount: number | null;
  created_at: string;
  updated_at: string;
}

