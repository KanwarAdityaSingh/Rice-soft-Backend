export type Brand = 'Tamara' | 'Hariom';

export interface Product {
  id: string;
  name: string;
  description: string | null;
  brand: Brand | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateProductDTO {
  name: string;
  description?: string;
  brand?: Brand;
  packet_type: string; // Required for auto-creating packaging entries
  created_by?: string;
}

export interface UpdateProductDTO {
  name?: string;
  description?: string;
  brand?: Brand;
  updated_by?: string;
}

export interface ProductResponse {
  id: string;
  name: string;
  description: string | null;
  brand: Brand | null;
  created_at: string;
  updated_at: string;
}

export interface ProductWithRecipesResponse extends ProductResponse {
  recipes: Array<{
    id: string;
    recipe_name: string;
  }>;
}

