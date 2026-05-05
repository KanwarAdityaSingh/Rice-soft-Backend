export interface Parameter {
  id: string;
  inward_slip_pass_id: string | null;
  product_id: string | null;
  batch_id: string | null;
  purity: string | null;
  natural_admixture: string | null;
  average_grain_length: string | null;
  moisture: string | null;
  broken_grain: string | null;
  damage_discolour_grain: string | null;
  immature_grains: string | null;
  whiteness: string | null;
  foreign_matter: string | null;
  black_grains: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateParameterDTO {
  inward_slip_pass_id?: string | null;
  product_id?: string | null;
  batch_id?: string | null;
  purity?: string | null;
  natural_admixture?: string | null;
  average_grain_length?: string | null;
  moisture?: string | null;
  broken_grain?: string | null;
  damage_discolour_grain?: string | null;
  immature_grains?: string | null;
  whiteness?: string | null;
  foreign_matter?: string | null;
  black_grains?: string | null;
  created_by?: string | null;
}

/** Partial update: only defined keys are applied; explicit null clears a column */
export interface UpdateParameterDTO {
  inward_slip_pass_id?: string | null;
  product_id?: string | null;
  batch_id?: string | null;
  purity?: string | null;
  natural_admixture?: string | null;
  average_grain_length?: string | null;
  moisture?: string | null;
  broken_grain?: string | null;
  damage_discolour_grain?: string | null;
  immature_grains?: string | null;
  whiteness?: string | null;
  foreign_matter?: string | null;
  black_grains?: string | null;
  updated_by?: string | null;
}

export interface ParameterResponse {
  id: string;
  inward_slip_pass_id: string | null;
  product_id: string | null;
  batch_id: string | null;
  purity: string | null;
  natural_admixture: string | null;
  average_grain_length: string | null;
  moisture: string | null;
  broken_grain: string | null;
  damage_discolour_grain: string | null;
  immature_grains: string | null;
  whiteness: string | null;
  foreign_matter: string | null;
  black_grains: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}
