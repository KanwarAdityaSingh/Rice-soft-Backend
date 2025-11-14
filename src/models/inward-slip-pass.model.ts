import { CreateInwardSlipLotDTO, InwardSlipLotResponse } from './inward-slip-lot.model';

export type InwardSlipStatus = 'pending' | 'completed';

export interface InwardSlipPass {
  id: string;
  sauda_id: string;
  slip_number: string;
  date: Date;
  vehicle_number: string;
  party_name: string;
  party_address: string | null;
  party_gst_number: string | null;
  status: InwardSlipStatus;
  inward_slip_bill_image_url: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateInwardSlipPassDTO {
  sauda_id: string;
  slip_number: string;
  date: string; // ISO date string
  vehicle_number: string;
  party_name: string;
  party_address?: string;
  party_gst_number?: string;
  status?: InwardSlipStatus;
  inward_slip_bill_image_url?: string;
  notes?: string;
  lots?: CreateInwardSlipLotDTO[];
  created_by?: string;
}

export interface UpdateInwardSlipPassDTO {
  slip_number?: string;
  date?: string;
  vehicle_number?: string;
  party_name?: string;
  party_address?: string;
  party_gst_number?: string;
  status?: InwardSlipStatus;
  inward_slip_bill_image_url?: string;
  notes?: string;
  updated_by?: string;
}

export interface InwardSlipPassResponse {
  id: string;
  sauda_id: string;
  slip_number: string;
  date: string;
  vehicle_number: string;
  party_name: string;
  party_address: string | null;
  party_gst_number: string | null;
  status: InwardSlipStatus;
  inward_slip_bill_image_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  lots?: InwardSlipLotResponse[];
}

