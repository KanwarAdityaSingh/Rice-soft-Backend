import { PackagingWeight } from './packaging.model';

export interface ProductRate {
  id: string;
  product_id: string;
  holding_capacity: PackagingWeight;
  rate: number;
  /** Business date the current rate applies to */
  effective_date: Date | string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateProductRateDTO {
  product_id: string;
  holding_capacity: PackagingWeight;
  rate: number;
  effective_date: string;
}

export interface UpsertProductRatesDTO {
  product_id: string;
  effective_date: string;
  rates: Array<{ holding_capacity: PackagingWeight; rate: number }>;
}

export interface ProductRateResponse {
  id: string;
  product_id: string;
  holding_capacity: number;
  rate: number;
  /** YYYY-MM-DD */
  effective_date: string;
  created_at: string;
  updated_at: string;
}
