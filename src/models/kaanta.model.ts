import type { BagType } from '../constants/bag-types';
export type { BagType } from '../constants/bag-types';
export { BAG_TYPE_VALUES } from '../constants/bag-types';

export interface Kaanta {
  id: string;
  kaanta_id: string;
  godown_id: string;
  sauda_id: string;
  inward_slip_pass_id: string;
  full_truck_weight: number;
  empty_truck_weight: number;
  kaanta_weight: number | null;
  said_sent_weight: number | null;
  bag_weight: number;
  no_of_bags: number;
  bag_type: BagType;
  khaali_kaanta_parchi_url: string | null;
  bhara_kaanta_parchi_url: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateKaantaDTO {
  godown_id: string;
  sauda_id: string;
  inward_slip_pass_id: string;
  full_truck_weight: number;
  empty_truck_weight: number;
  said_sent_weight?: number;
  bag_weight: number;
  no_of_bags: number;
  bag_type: BagType;
  created_by?: string;
}

export interface UpdateKaantaDTO {
  full_truck_weight?: number;
  empty_truck_weight?: number;
  said_sent_weight?: number;
  bag_weight?: number;
  no_of_bags?: number;
  bag_type?: BagType;
  khaali_kaanta_parchi_url?: string;
  bhara_kaanta_parchi_url?: string;
  updated_by?: string;
}

export interface KaantaResponse {
  id: string;
  kaanta_id: string;
  godown_id: string;
  sauda_id: string;
  inward_slip_pass_id: string;
  full_truck_weight: number;
  empty_truck_weight: number;
  kaanta_weight: number | null;
  said_sent_weight: number | null;
  bag_weight: number;
  no_of_bags: number;
  bag_type: BagType;
  khaali_kaanta_parchi_url: string | null;
  bhara_kaanta_parchi_url: string | null;
  created_at: string;
  updated_at: string;
}

