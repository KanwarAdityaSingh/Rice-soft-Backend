import type { RiceCategory, RiceVariant } from '../constants/rice-categories';

export interface RiceCodeVariant {
  id: string;
  rice_code_id: string;
  variant: RiceVariant;
  created_at: Date;
  updated_at: Date;
}

export interface RiceCode {
  rice_code_id: string;
  rice_code_name: string;
  category: RiceCategory;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
  variants: RiceCodeVariant[];
}

export interface CreateRiceCodeDTO {
  rice_code_name: string;
  category: RiceCategory;
  variants: RiceVariant[];
  created_by?: string;
}

export interface UpdateRiceCodeDTO {
  rice_code_name?: string;
  category?: RiceCategory;
  variants?: RiceVariant[];
  updated_by?: string;
}

export interface RiceCodeVariantResponse {
  id: string;
  variant: RiceVariant;
  created_at: string;
  updated_at: string;
}

export interface RiceCodeResponse {
  rice_code_id: string;
  rice_code_name: string;
  category: RiceCategory;
  variants: RiceCodeVariantResponse[];
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}
