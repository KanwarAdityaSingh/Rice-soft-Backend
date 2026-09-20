export type SalesSaudaDiscountType = 'per_kg' | 'percentage';

import type { SalesSaudaLineType } from '../constants/sales-lot-sale';

export type { SalesSaudaLineType };

export interface SalesSaudaLine {
  id: string;
  sales_sauda_id: string;
  line_type: SalesSaudaLineType;
  product_id: string | null;
  /** Optional invoice display name; null → use product master name */
  product_alias: string | null;
  lot_id: string | null;
  packaging_id: string | null;
  packet_count: number | null;
  /** Lot lines only — optional; not required to match quantity */
  no_of_bags: number | null;
  /** Lot lines only — kg per bag; optional */
  bag_weight: number | null;
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
  line_type?: SalesSaudaLineType;
  product_id?: string;
  product_alias?: string | null;
  lot_id?: string;
  packaging_id?: string;
  packet_count?: number;
  no_of_bags?: number;
  bag_weight?: number;
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
  line_type?: SalesSaudaLineType;
  product_id?: string | null;
  product_alias?: string | null;
  lot_id?: string | null;
  packaging_id?: string | null;
  packet_count?: number | null;
  no_of_bags?: number | null;
  bag_weight?: number | null;
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
  line_type: SalesSaudaLineType;
  product_id: string | null;
  product_alias: string | null;
  lot_id: string | null;
  packaging_id: string | null;
  packet_count: number | null;
  /** Lot lines only — optional; not required to match quantity */
  no_of_bags: number | null;
  /** Lot lines only — kg per bag; optional */
  bag_weight: number | null;
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
