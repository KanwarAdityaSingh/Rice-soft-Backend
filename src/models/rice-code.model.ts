export interface RiceCode {
  rice_code_id: string;
  rice_code_name: string;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateRiceCodeDTO {
  rice_code_name: string;
  created_by?: string;
}

export interface UpdateRiceCodeDTO {
  rice_code_name?: string;
  updated_by?: string;
}

export interface RiceCodeResponse {
  rice_code_id: string;
  rice_code_name: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

