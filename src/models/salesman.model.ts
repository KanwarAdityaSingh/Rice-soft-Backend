export interface Salesman {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  is_active: boolean;
  user_id: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateSalesmanDTO {
  name: string;
  phone: string;
  email?: string;
  is_active?: boolean;
  created_by?: string;
  user_id?: string;
}

export interface UpdateSalesmanDTO {
  name?: string;
  phone?: string;
  email?: string;
  is_active?: boolean;
  updated_by?: string;
}

export interface SalesmanResponse {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

