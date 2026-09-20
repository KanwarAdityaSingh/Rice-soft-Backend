export type BrandStatus = 'active' | 'inactive';

export interface Brand {
  id: string;
  name: string;
  code_prefix: string;
  status: BrandStatus;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateBrandDTO {
  name: string;
  code_prefix: string;
  status?: BrandStatus;
  created_by?: string;
}

export interface UpdateBrandDTO {
  name?: string;
  code_prefix?: string;
  status?: BrandStatus;
  updated_by?: string;
}

export interface BrandResponse {
  id: string;
  name: string;
  code_prefix: string;
  status: BrandStatus;
  created_at: string;
  updated_at: string;
}

export function toBrandResponse(brand: Brand): BrandResponse {
  return {
    id: brand.id,
    name: brand.name,
    code_prefix: brand.code_prefix,
    status: brand.status,
    created_at: brand.created_at.toISOString(),
    updated_at: brand.updated_at.toISOString(),
  };
}
