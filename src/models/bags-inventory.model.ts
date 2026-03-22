import { BagType } from './kaanta.model';

export interface BagsInventory {
  id: string;
  godown_id: string;
  bag_type: BagType;
  bag_capacity: number;
  filled_bags: number;
  empty_bags: number;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateBagsInventoryDTO {
  godown_id: string;
  bag_type: BagType;
  bag_capacity: number;
  filled_bags?: number;
  empty_bags?: number;
  created_by?: string;
}

export interface UpdateBagsInventoryDTO {
  filled_bags?: number;
  empty_bags?: number;
  updated_by?: string;
}

export interface BagsInventoryResponse {
  id: string;
  godown_id: string;
  bag_type: BagType;
  bag_capacity: number;
  filled_bags: number;
  empty_bags: number;
  created_at: string;
  updated_at: string;
}

