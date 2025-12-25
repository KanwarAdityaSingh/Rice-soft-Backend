export interface RecipeFormulaItem {
  lot_id: string;
  percentage: number;
}

export interface Recipe {
  id: string;
  recipe_name: string;
  formula: RecipeFormulaItem[];
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateRecipeDTO {
  recipe_name: string;
  formula: RecipeFormulaItem[];
  created_by?: string;
}

export interface UpdateRecipeDTO {
  recipe_name?: string;
  formula?: RecipeFormulaItem[];
  updated_by?: string;
}

export interface RecipeResponse {
  id: string;
  recipe_name: string;
  formula: RecipeFormulaItem[];
  created_at: string;
  updated_at: string;
}

