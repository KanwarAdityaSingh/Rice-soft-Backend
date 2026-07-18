import { RiceType } from './lead.model';
import type { HsnCode } from '../constants/hsn-codes';

export type Brand = 'Tamara' | 'Hariom';
export type { HsnCode };

export interface Product {
  id: string;
  name: string;
  description: string | null;
  brand: Brand | null;
  rice_type: RiceType | null;
  hsn_code: HsnCode | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateProductDTO {
  name: string;
  description?: string;
  brand?: Brand;
  rice_type?: RiceType;
  hsn_code?: HsnCode | null;
  created_by?: string;
}

export interface UpdateProductDTO {
  name?: string;
  description?: string;
  brand?: Brand;
  rice_type?: RiceType;
  hsn_code?: HsnCode | null;
  updated_by?: string;
}

/** Rate per holding capacity (kg), embedded in product list/detail responses */
export interface ProductRateItem {
  holding_capacity: number;
  rate: number;
  /** YYYY-MM-DD — business date of the current rate */
  effective_date: string;
}

export interface ProductResponse {
  id: string;
  name: string;
  description: string | null;
  brand: Brand | null;
  rice_type: RiceType | null;
  hsn_code: HsnCode | null;
  rates: ProductRateItem[];
  created_at: string;
  updated_at: string;
}
