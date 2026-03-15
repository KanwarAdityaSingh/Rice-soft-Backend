export interface SalesSaudaLine {
  id: string;
  sales_sauda_id: string;
  product_id: string;
  packaging_id: string | null;
  quantity: number;
  quantity_unit: string;
  rate: number;
  amount: number;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateSalesSaudaLineDTO {
  product_id: string;
  packaging_id?: string;
  quantity: number;
  quantity_unit?: string;
  rate: number;
  sort_order?: number;
}

export interface UpdateSalesSaudaLineDTO {
  product_id?: string;
  packaging_id?: string | null;
  quantity?: number;
  quantity_unit?: string;
  rate?: number;
  sort_order?: number;
}

export interface SalesSaudaLineResponse {
  id: string;
  sales_sauda_id: string;
  product_id: string;
  packaging_id: string | null;
  quantity: number;
  quantity_unit: string;
  rate: number;
  amount: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
