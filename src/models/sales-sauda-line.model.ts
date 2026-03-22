export type SalesSaudaDiscountType = 'per_kg' | 'percentage';

export interface SalesSaudaLine {
  id: string;
  sales_sauda_id: string;
  product_id: string;
  packaging_id: string | null;
  packet_count: number | null;
  quantity: number;
  quantity_unit: string;
  rate: number;
  discount_value: number;
  discount_type: SalesSaudaDiscountType;
  gst_percent: number;
  amount: number;
  discount_amount: number;
  gst_amount: number;
  final_amount: number;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateSalesSaudaLineDTO {
  product_id: string;
  packaging_id?: string;
  packet_count?: number;
  quantity?: number;
  quantity_unit?: string;
  rate: number;
  discount_value?: number;
  discount_type?: SalesSaudaDiscountType;
  gst_percent?: number;
  amount?: number;
  discount_amount?: number;
  gst_amount?: number;
  final_amount?: number;
  sort_order?: number;
}

export interface UpdateSalesSaudaLineDTO {
  product_id?: string;
  packaging_id?: string | null;
  packet_count?: number | null;
  quantity?: number;
  quantity_unit?: string;
  rate?: number;
  discount_value?: number;
  discount_type?: SalesSaudaDiscountType;
  gst_percent?: number;
  amount?: number;
  discount_amount?: number;
  gst_amount?: number;
  final_amount?: number;
  sort_order?: number;
}

export interface SalesSaudaLineResponse {
  id: string;
  sales_sauda_id: string;
  product_id: string;
  packaging_id: string | null;
  packet_count: number | null;
  quantity: number;
  quantity_unit: string;
  rate: number;
  discount_value: number;
  discount_type: SalesSaudaDiscountType;
  gst_percent: number;
  amount: number;
  discount_amount: number;
  gst_amount: number;
  final_amount: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
