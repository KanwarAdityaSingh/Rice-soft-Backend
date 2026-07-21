import type { Address, BankDetails } from './vendor.model';
import type { EntityKycVerificationDetails } from './kyc-verification.model';
import type { SalesmanCommissionType } from '../constants/salesman-commission-types';
import type { SalesmanAssignedAreaInput } from '../dao/salesman-assigned-area.dao';

export type { Address, BankDetails };
export type { SalesmanCommissionType };

/** Currently only monthly; kept as enum for future salary types. */
export type SalesmanSalaryType = 'monthly';

export interface SalesmanAssignedAreaResponse {
  id: string;
  state: string | null;
  district: string | null;
  city: string | null;
  territory: string | null;
}

export interface SalesmanCustomerAllocationResponse {
  id: string;
  sales_party_id: string;
  sales_party_name: string | null;
}

export interface Salesman {
  id: string;
  salesperson_code: string;
  name: string;
  phone: string;
  alternate_phone: string | null;
  email: string | null;
  date_of_birth: Date | null;
  date_of_joining: Date | null;
  designation: string | null;
  aadhar_number: string | null;
  pan_number: string | null;
  address: Address;
  bank_details: BankDetails | null;
  bank_details_verified_at: Date | null;
  bank_details_verified_by: string | null;
  bank_verification_error: string | null;
  kyc_verification_details: EntityKycVerificationDetails;
  is_verified: boolean;
  verified_at: Date | null;
  salary_type: SalesmanSalaryType | null;
  basic_salary: number | null;
  salary_effective_from: Date | null;
  /** Enabled commission types (rates filled on sales sauda). */
  commission_types: SalesmanCommissionType[];
  is_active: boolean;
  user_id: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateSalesmanDTO {
  name: string;
  phone: string;
  alternate_phone?: string | null;
  email?: string | null;
  date_of_birth?: string | null;
  date_of_joining?: string | null;
  designation?: string | null;
  aadhar_number?: string | null;
  pan_number?: string | null;
  address?: Address;
  bank_details?: BankDetails;
  /** If true, compare bank_details to prior KYC bank snapshot after insert. */
  verify_bank?: boolean;
  kyc_verification_details?: EntityKycVerificationDetails;
  salary_type?: SalesmanSalaryType | null;
  basic_salary?: number | null;
  /** Required when setting salary (create or update). */
  salary_effective_from?: string | null;
  commission_types?: SalesmanCommissionType[];
  /** Replace-set of assigned geography rows. */
  assigned_areas?: SalesmanAssignedAreaInput[];
  /** Replace-set of allocated sales party ids. */
  allocated_sales_party_ids?: string[];
  is_active?: boolean;
  created_by?: string;
  user_id?: string;
}

export interface UpdateSalesmanDTO {
  name?: string;
  phone?: string;
  alternate_phone?: string | null;
  email?: string | null;
  date_of_birth?: string | null;
  date_of_joining?: string | null;
  designation?: string | null;
  aadhar_number?: string | null;
  pan_number?: string | null;
  address?: Address;
  bank_details?: BankDetails;
  verify_bank?: boolean;
  kyc_verification_details?: EntityKycVerificationDetails;
  salary_type?: SalesmanSalaryType | null;
  basic_salary?: number | null;
  salary_effective_from?: string | null;
  commission_types?: SalesmanCommissionType[];
  assigned_areas?: SalesmanAssignedAreaInput[];
  allocated_sales_party_ids?: string[];
  is_active?: boolean;
  updated_by?: string;
}

export interface SalesmanResponse {
  id: string;
  salesperson_code: string;
  name: string;
  phone: string;
  alternate_phone: string | null;
  email: string | null;
  date_of_birth: string | null;
  date_of_joining: string | null;
  designation: string | null;
  aadhar_number: string | null;
  pan_number: string | null;
  address: Address;
  bank_details: BankDetails | null;
  bank_details_verified_at: string | null;
  bank_details_verified_by: string | null;
  bank_verification_error: string | null;
  kyc_verification_details: EntityKycVerificationDetails;
  is_verified: boolean;
  verified_at: string | null;
  salary_type: SalesmanSalaryType | null;
  basic_salary: number | null;
  salary_effective_from: string | null;
  commission_types: SalesmanCommissionType[];
  assigned_areas?: SalesmanAssignedAreaResponse[];
  customer_allocations?: SalesmanCustomerAllocationResponse[];
  is_active: boolean;
  user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SalesmanSalaryHistory {
  id: string;
  salesman_id: string;
  salary_type: SalesmanSalaryType;
  basic_salary: number;
  effective_from: Date;
  created_at: Date;
  created_by: string | null;
}

export interface SalesmanSalaryHistoryResponse {
  id: string;
  salesman_id: string;
  salary_type: SalesmanSalaryType;
  basic_salary: number;
  effective_from: string;
  created_at: string;
  created_by: string | null;
}

export interface UpsertSalesmanSalaryDTO {
  salary_type: SalesmanSalaryType;
  basic_salary: number;
  effective_from: string;
  created_by?: string;
}
