import type { Address } from './vendor.model';
import type { SalesSaudaType } from '../constants/sales-sauda-types';

export type SalesSaudaStatus = 'draft' | 'order' | 'cancelled';
export type { SalesSaudaType };

export interface SalesSauda {
  id: string;
  sales_party_id: string;
  salesman_id: string | null;
  /** Joined from salesmen when selected */
  salesman_name?: string | null;
  sauda_type: SalesSaudaType | null;
  status: SalesSaudaStatus;
  order_number: string | null;
  sauda_date: Date | string | null;
  /** Indian FY label Apr–Mar, e.g. 2025-2026 */
  financial_year: string;
  billing_address: Address | null;
  delivery_address: Address | null;
  notes: string | null;
  payment_terms: number | null;
  amount: number;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateSalesSaudaDTO {
  sales_party_id: string;
  salesman_id?: string | null;
  sauda_type: SalesSaudaType;
  status?: SalesSaudaStatus;
  sauda_date?: string | Date;
  financial_year?: string;
  billing_address?: Address | null;
  delivery_address?: Address | null;
  notes?: string;
  payment_terms?: number | null;
  amount?: number;
  created_by?: string;
}

export interface UpdateSalesSaudaDTO {
  sales_party_id?: string;
  salesman_id?: string | null;
  sauda_type?: SalesSaudaType;
  status?: SalesSaudaStatus;
  order_number?: string | null;
  sauda_date?: string | Date;
  financial_year?: string;
  billing_address?: Address | null;
  delivery_address?: Address | null;
  notes?: string;
  payment_terms?: number | null;
  amount?: number;
  updated_by?: string;
}

export interface SalesSaudaResponse {
  id: string;
  /** First 4 hex digits of id — compact table label */
  display_id: string;
  sales_party_id: string;
  salesman_id: string | null;
  salesman_name: string | null;
  sauda_type: SalesSaudaType | null;
  status: SalesSaudaStatus;
  order_number: string | null;
  sauda_date: string | null;
  financial_year: string;
  billing_address: Address | null;
  delivery_address: Address | null;
  notes: string | null;
  payment_terms: number | null;
  amount: number;
  created_at: string;
  updated_at: string;
}
