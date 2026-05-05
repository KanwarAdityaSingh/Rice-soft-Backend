import { inwardSlipLotDAO } from '../dao/inward-slip-lot.dao';
import { recipeDAO } from '../dao/recipe.dao';
import {
  RecipeCostPreviewLine,
  RecipeCostPreviewResponse,
  RecipeFormulaItem,
} from '../models/recipe.model';
import { BadRequestError, NotFoundError } from '../utils/errors';

const FORMULA_SUM_TOLERANCE = 0.01;

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function roundKg(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export class RecipeService {
  private assertFormulaSum100(formula: RecipeFormulaItem[]): void {
    const sum = formula.reduce((s, i) => s + i.percentage, 0);
    if (Math.abs(sum - 100) > FORMULA_SUM_TOLERANCE) {
      throw new BadRequestError(`Recipe formula percentages must sum to 100%, got ${sum}%`);
    }
  }

  /**
   * For a target batch output weight (kg), split by recipe percentages (same as batch production)
   * and value each share at the lot's current purchase rate (inward_slip_lots.rate per kg).
   */
  async previewCostByFormula(quantityKg: number, formula: RecipeFormulaItem[]): Promise<RecipeCostPreviewResponse> {
    if (quantityKg <= 0) {
      throw new BadRequestError('quantity_kg must be greater than 0');
    }
    if (formula.length === 0) {
      throw new BadRequestError('formula must contain at least one lot');
    }
    this.assertFormulaSum100(formula);

    const uniqueLotIds = [...new Set(formula.map((f) => f.lot_id))];
    const lots = await inwardSlipLotDAO.findByIds(uniqueLotIds);
    const lotById = new Map(lots.map((l) => [l.id, l]));
    const missing = uniqueLotIds.filter((id) => !lotById.has(id));
    if (missing.length > 0) {
      throw new NotFoundError(`Lot(s) not found: ${missing.join(', ')}`);
    }

    const lines: RecipeCostPreviewLine[] = [];
    let totalCost = 0;

    for (const item of formula) {
      const lot = lotById.get(item.lot_id)!;
      const rate = parseFloat(lot.rate.toString());
      const kgFromLot = (quantityKg * item.percentage) / 100;
      const lineCost = kgFromLot * rate;
      totalCost += lineCost;

      lines.push({
        lot_id: lot.id,
        lot_number: lot.lot_number,
        percentage: item.percentage,
        kg_from_lot: roundKg(kgFromLot),
        rate,
        line_cost: roundMoney(lineCost),
      });
    }

    const blendedRatePerKg = totalCost / quantityKg;

    return {
      quantity_kg: quantityKg,
      total_cost: roundMoney(totalCost),
      blended_rate_per_kg: roundMoney(blendedRatePerKg),
      assumption:
        'line_cost = kg_from_lot × lot.rate, where kg_from_lot = quantity_kg × (percentage ÷ 100); matches batch lot consumption share weighting',
      lines,
    };
  }

  async previewCostByRecipeId(recipeId: string, quantityKg: number): Promise<RecipeCostPreviewResponse> {
    const recipe = await recipeDAO.findById(recipeId);
    if (!recipe) {
      throw new NotFoundError('Recipe not found');
    }
    const preview = await this.previewCostByFormula(quantityKg, recipe.formula);
    return {
      ...preview,
      recipe_id: recipe.id,
      recipe_name: recipe.recipe_name,
    };
  }
}

export const recipeService = new RecipeService();
