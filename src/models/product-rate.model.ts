import { PackagingWeight } from './packaging.model';

export interface ProductRate {
  id: string;
  product_id: string;
  holding_capacity: PackagingWeight;
  rate: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateProductRateDTO {
  product_id: string;
  holding_capacity: PackagingWeight;
  rate: number;
}

export interface UpsertProductRatesDTO {
  product_id: string;
  rates: Array<{ holding_capacity: PackagingWeight; rate: number }>;
}

export interface ProductRateResponse {
  id: string;
  product_id: string;
  holding_capacity: number;
  rate: number;
  created_at: string;
  updated_at: string;
}
