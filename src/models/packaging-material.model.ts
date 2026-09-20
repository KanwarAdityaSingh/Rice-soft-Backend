export type PackagingMaterialStatus = 'active' | 'inactive';

export interface PackagingMaterial {
  id: string;
  name: string;
  status: PackagingMaterialStatus;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreatePackagingMaterialDTO {
  name: string;
  status?: PackagingMaterialStatus;
  created_by?: string;
}

export interface UpdatePackagingMaterialDTO {
  name?: string;
  status?: PackagingMaterialStatus;
  updated_by?: string;
}

export interface PackagingMaterialResponse {
  id: string;
  name: string;
  status: PackagingMaterialStatus;
  created_at: string;
  updated_at: string;
}

export function toPackagingMaterialResponse(row: PackagingMaterial): PackagingMaterialResponse {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
