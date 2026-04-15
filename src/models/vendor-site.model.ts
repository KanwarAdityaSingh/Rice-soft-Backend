import type { Address } from './vendor.model';

export interface VendorSite {
  id: string;
  vendor_id: string;
  name: string | null;
  address: Address;
  google_location_link: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateVendorSiteDTO {
  vendor_id: string;
  name?: string | null;
  address: Address;
  google_location_link?: string | null;
  is_active?: boolean;
  created_by?: string;
}

export interface UpdateVendorSiteDTO {
  name?: string | null;
  address?: Address;
  google_location_link?: string | null;
  is_active?: boolean;
  updated_by?: string;
}

export interface VendorSiteResponse {
  id: string;
  vendor_id: string;
  name: string | null;
  address: Address;
  google_location_link: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
