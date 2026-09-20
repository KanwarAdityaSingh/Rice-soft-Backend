import { RiceType } from './lead.model';
import type { HsnCode } from '../constants/hsn-codes';
import type { RiceCategory, RiceVariant } from '../constants/rice-categories';

/** Legacy enum values still stored when brand name fits brand_enum */
export type Brand = 'Tamara' | 'Hariom';
export type { HsnCode };

export type ProductStatus = 'active' | 'inactive' | 'discontinued';

/** Names that can dual-write into products.brand (brand_enum) */
export const LEGACY_BRAND_ENUM_VALUES = ['Tamara', 'Hariom'] as const;

export interface Product {
  id: string;
  name: string;
  description: string | null;
  /** Display brand name (COALESCE brands.name, legacy enum) for sales-safe responses */
  brand: string | null;
  brand_id: string;
  rice_type: RiceType | null;
  rice_category: RiceCategory;
  rice_variant: RiceVariant;
  hsn_code: HsnCode | null;
  product_code: string | null;
  status: ProductStatus;
  bag_image_url: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateProductDTO {
  name: string;
  description?: string;
  brand_id: string;
  rice_category: RiceCategory;
  /** Processing variant for rice_category — same values as rice-codes/getRiceVariants */
  rice_variant: RiceVariant;
  /** Optional override; server defaults from rice_category when omitted */
  hsn_code?: HsnCode | null;
  bag_image_url: string;
  status?: ProductStatus;
  /** Legacy optional fields — ignored if brand_id/rice_category present; kept for dual-accept */
  brand?: Brand | string;
  rice_type?: RiceType;
  created_by?: string;
}

export interface UpdateProductDTO {
  name?: string;
  description?: string;
  brand_id?: string;
  rice_category?: RiceCategory;
  rice_variant?: RiceVariant;
  hsn_code?: HsnCode | null;
  bag_image_url?: string | null;
  status?: ProductStatus;
  brand?: Brand | string;
  rice_type?: RiceType;
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
  brand: string | null;
  brand_id: string;
  rice_type: RiceType | null;
  rice_category: RiceCategory;
  rice_variant: RiceVariant;
  hsn_code: HsnCode | null;
  product_code: string | null;
  status: ProductStatus;
  bag_image_url: string | null;
  rates: ProductRateItem[];
  created_at: string;
  updated_at: string;
}
