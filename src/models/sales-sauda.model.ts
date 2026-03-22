export type SalesSaudaStatus = 'draft' | 'order' | 'cancelled';

export interface SalesSauda {
  id: string;
  sales_party_id: string;
  status: SalesSaudaStatus;
  order_number: string | null;
  sauda_date: Date | string | null;
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
  status?: SalesSaudaStatus;
  sauda_date?: string | Date;
  notes?: string;
  payment_terms?: number | null;
  amount?: number;
  created_by?: string;
}

export interface UpdateSalesSaudaDTO {
  sales_party_id?: string;
  status?: SalesSaudaStatus;
  order_number?: string | null;
  sauda_date?: string | Date;
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
  status: SalesSaudaStatus;
  order_number: string | null;
  sauda_date: string | null;
  notes: string | null;
  payment_terms: number | null;
  amount: number;
  created_at: string;
  updated_at: string;
}
