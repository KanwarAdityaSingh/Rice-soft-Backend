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

/** One line of blended-input cost for a target batch quantity (kg share × lot rate). */
export interface RecipeCostPreviewLine {
  lot_id: string;
  lot_number: string;
  percentage: number;
  /** Kg of output batch drawn from this lot for the requested quantity */
  kg_from_lot: number;
  /** Purchase rate from inward_slip_lots (basis: amount = received_weight × rate) */
  rate: number;
  line_cost: number;
}

export interface RecipeCostPreviewResponse {
  quantity_kg: number;
  total_cost: number;
  /** total_cost / quantity_kg — effective input cost per kg of blend at this batch size */
  blended_rate_per_kg: number;
  /** How numbers were derived (for UI / finance review) */
  assumption: string;
  lines: RecipeCostPreviewLine[];
  recipe_id?: string;
  recipe_name?: string;
}

