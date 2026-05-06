import { PoolClient } from 'pg';
import { db } from '../database/connection';
import { logger } from '../utils/logger';

export interface RecipeAdditionalCostRow {
  id: string;
  recipe_id: string;
  cost_type: string;
  amount: number;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export type RecipeAdditionalCostInput = { cost_type: string; amount: number };

export class RecipeAdditionalCostDAO {
  async replaceAllClient(client: PoolClient, recipeId: string, items: RecipeAdditionalCostInput[]): Promise<void> {
    await client.query('DELETE FROM recipe_additional_costs WHERE recipe_id = $1', [recipeId]);
    let sortOrder = 0;
    for (const it of items) {
      await client.query(
        `INSERT INTO recipe_additional_costs (recipe_id, cost_type, amount, sort_order)
         VALUES ($1, $2, $3, $4)`,
        [recipeId, it.cost_type, it.amount, sortOrder++]
      );
    }
  }

  async findByRecipeId(recipeId: string): Promise<RecipeAdditionalCostRow[]> {
    const query = `
      SELECT id, recipe_id, cost_type, amount, sort_order, created_at, updated_at
      FROM recipe_additional_costs
      WHERE recipe_id = $1
      ORDER BY sort_order ASC, created_at ASC
    `;
    const result = await db.query<RecipeAdditionalCostRow>(query, [recipeId]);
    return result.rows;
  }

  async findByRecipeIds(recipeIds: string[]): Promise<Map<string, RecipeAdditionalCostRow[]>> {
    const map = new Map<string, RecipeAdditionalCostRow[]>();
    if (recipeIds.length === 0) {
      return map;
    }
    const query = `
      SELECT id, recipe_id, cost_type, amount, sort_order, created_at, updated_at
      FROM recipe_additional_costs
      WHERE recipe_id = ANY($1::uuid[])
      ORDER BY recipe_id, sort_order ASC, created_at ASC
    `;
    const result = await db.query<RecipeAdditionalCostRow>(query, [recipeIds]);
    for (const row of result.rows) {
      const list = map.get(row.recipe_id) ?? [];
      list.push(row);
      map.set(row.recipe_id, list);
    }
    return map;
  }

  /**
   * @deprecated Prefer replaceAllClient inside a broader transaction
   */
  async replaceAll(recipeId: string, items: RecipeAdditionalCostInput[]): Promise<void> {
    try {
      await db.transaction(async (client) => {
        await this.replaceAllClient(client, recipeId, items);
      });
      logger.info('Recipe additional costs replaced', { recipe_id: recipeId, count: items.length });
    } catch (error) {
      logger.error('Error replacing recipe additional costs', { error, recipeId });
      throw error;
    }
  }
}

export const recipeAdditionalCostDAO = new RecipeAdditionalCostDAO();
