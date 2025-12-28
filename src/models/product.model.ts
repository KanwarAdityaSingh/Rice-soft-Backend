import { RiceType } from './lead.model';

export type Brand = 'Tamara' | 'Hariom';

export interface Product {
  id: string;
  name: string;
  description: string | null;
  brand: Brand | null;
  rice_type: RiceType | null;
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
  created_by?: string;
}

export interface UpdateProductDTO {
  name?: string;
  description?: string;
  brand?: Brand;
  rice_type?: RiceType;
  updated_by?: string;
}

export interface ProductResponse {
  id: string;
  name: string;
  description: string | null;
  brand: Brand | null;
  rice_type: RiceType | null;
  created_at: string;
  updated_at: string;
}

