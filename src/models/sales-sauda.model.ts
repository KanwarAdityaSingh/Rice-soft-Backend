export type SalesSaudaStatus = 'draft' | 'order' | 'cancelled';

export interface SalesSauda {
  id: string;
  customer_id: string;
  status: SalesSaudaStatus;
  order_number: string | null;
  sauda_date: Date | string | null;
  notes: string | null;
  amount: number;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateSalesSaudaDTO {
  customer_id: string;
  status?: SalesSaudaStatus;
  sauda_date?: string | Date;
  notes?: string;
  amount?: number;
  created_by?: string;
}

export interface UpdateSalesSaudaDTO {
  customer_id?: string;
  status?: SalesSaudaStatus;
  order_number?: string | null;
  sauda_date?: string | Date;
  notes?: string;
  amount?: number;
  updated_by?: string;
}

export interface SalesSaudaResponse {
  id: string;
  customer_id: string;
  status: SalesSaudaStatus;
  order_number: string | null;
  sauda_date: string | null;
  notes: string | null;
  amount: number;
  created_at: string;
  updated_at: string;
}
