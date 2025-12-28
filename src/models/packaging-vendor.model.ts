import { Address, ContactPerson } from './broker.model';

export interface PackagingVendor {
  id: string;
  name: string;
  contact_persons: ContactPerson[];
  address: Address;
  gst_number: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreatePackagingVendorDTO {
  name: string;
  contact_persons: ContactPerson[];
  address: Address;
  gst_number?: string;
  created_by?: string;
}

export interface UpdatePackagingVendorDTO {
  name?: string;
  contact_persons?: ContactPerson[];
  address?: Address;
  gst_number?: string;
  updated_by?: string;
}

export interface PackagingVendorResponse {
  id: string;
  name: string;
  contact_persons: ContactPerson[];
  address: Address;
  gst_number: string | null;
  created_at: string;
  updated_at: string;
}

