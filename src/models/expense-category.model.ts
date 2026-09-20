export interface ExpenseCategory {
  id: string;
  name: string;
  code: string;
  description: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateExpenseCategoryDTO {
  name: string;
  code?: string; // Optional - auto-generated from name if not provided
  description?: string;
  created_by?: string;
}

export interface UpdateExpenseCategoryDTO {
  name?: string;
  code?: string;
  description?: string;
  is_active?: boolean;
  updated_by?: string;
}

export interface ExpenseCategoryResponse {
  id: string;
  name: string;
  code: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
