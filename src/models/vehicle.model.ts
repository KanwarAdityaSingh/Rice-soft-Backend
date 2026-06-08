import type { VehicleVerificationDetails } from './kyc-verification.model';

export interface Vehicle {
  id: string;
  vehicle_number: string; // Primary identifier (e.g., DL01AB1234)
  rc_number: string | null; // RC number if different from vehicle_number
  owner_name: string | null;
  vehicle_class: string | null; // LMV, HMV, etc.
  fuel_type: string | null; // Diesel, Petrol, CNG, Electric
  maker_model: string | null; // TATA ACE, MAHINDRA BOLERO
  registration_date: Date | null;
  insurance_validity: Date | null;
  fitness_validity: Date | null;
  permit_validity: Date | null;
  challan_details: any[] | null; // Array of challan objects
  transporter_ids: string[]; // Array of transporter UUIDs
  is_verified: boolean; // True if verified via Surepass
  verified_at: Date | null;
  verification_details: VehicleVerificationDetails;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateVehicleDTO {
  vehicle_number: string;
  rc_number?: string;
  owner_name?: string;
  vehicle_class?: string;
  fuel_type?: string;
  maker_model?: string;
  registration_date?: string;
  insurance_validity?: string;
  fitness_validity?: string;
  permit_validity?: string;
  challan_details?: any[];
  transporter_ids?: string[];
  is_verified?: boolean;
  verified_at?: string;
  verification_details?: VehicleVerificationDetails;
  is_active?: boolean;
  created_by?: string;
}

export interface UpdateVehicleDTO {
  vehicle_number?: string;
  rc_number?: string;
  owner_name?: string;
  vehicle_class?: string;
  fuel_type?: string;
  maker_model?: string;
  registration_date?: string;
  insurance_validity?: string;
  fitness_validity?: string;
  permit_validity?: string;
  challan_details?: any[];
  transporter_ids?: string[];
  verification_details?: VehicleVerificationDetails;
  is_active?: boolean;
  updated_by?: string;
}

export interface VehicleResponse {
  id: string;
  vehicle_number: string;
  rc_number: string | null;
  owner_name: string | null;
  vehicle_class: string | null;
  fuel_type: string | null;
  maker_model: string | null;
  registration_date: string | null;
  insurance_validity: string | null;
  fitness_validity: string | null;
  permit_validity: string | null;
  challan_details: any[] | null;
  transporter_ids: string[];
  is_verified: boolean;
  verified_at: string | null;
  verification_details: VehicleVerificationDetails;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
