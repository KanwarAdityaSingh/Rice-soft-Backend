export interface RiceLength {
  rice_length_id: string;
  name: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateRiceLengthDTO {
  name: string;
  is_active?: boolean;
  created_by?: string;
}

export interface UpdateRiceLengthDTO {
  name?: string;
  is_active?: boolean;
  updated_by?: string;
}

export interface RiceLengthResponse {
  rice_length_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}
