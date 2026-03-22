import type { Address, ContactPerson } from './vendor.model';

export interface Godown {
  id: string;
  name: string;
  gst_number: string | null;
  address: Address;
  google_maps_link: string | null;
  contact_persons: ContactPerson[];
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateGodownDTO {
  name: string;
  gst_number?: string | null;
  address: Address;
  google_maps_link?: string | null;
  contact_persons: ContactPerson[];
  is_active?: boolean;
  created_by?: string;
}

export interface UpdateGodownDTO {
  name?: string;
  gst_number?: string | null;
  address?: Address;
  google_maps_link?: string | null;
  contact_persons?: ContactPerson[];
  is_active?: boolean;
  updated_by?: string;
}

export interface GodownResponse {
  id: string;
  name: string;
  gst_number: string | null;
  address: Address;
  google_maps_link: string | null;
  contact_persons: ContactPerson[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
