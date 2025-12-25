import { db } from '../database/connection';
import { Recipe, CreateRecipeDTO, UpdateRecipeDTO } from '../models/recipe.model';
import { logger } from '../utils/logger';

export class RecipeDAO {
  async findAll(): Promise<Recipe[]> {
    const query = `
      SELECT id, recipe_name, formula, created_at, updated_at, created_by, updated_by
      FROM recipes
      ORDER BY recipe_name ASC
    `;
    const result = await db.query<Recipe>(query);
    // Parse JSONB formula to array
    return result.rows.map(row => ({
      ...row,
      formula: typeof row.formula === 'string' ? JSON.parse(row.formula) : row.formula
    }));
  }

  async findById(id: string): Promise<Recipe | null> {
    const query = `
      SELECT id, recipe_name, formula, created_at, updated_at, created_by, updated_by
      FROM recipes
      WHERE id = $1
    `;
    const result = await db.query<Recipe>(query, [id]);
    if (result.rows.length === 0) {
      return null;
    }
    const row = result.rows[0];
    return {
      ...row,
      formula: typeof row.formula === 'string' ? JSON.parse(row.formula) : row.formula
    };
  }

  async findByName(recipeName: string): Promise<Recipe | null> {
    const query = `
      SELECT id, recipe_name, formula, created_at, updated_at, created_by, updated_by
      FROM recipes
      WHERE recipe_name = $1
    `;
    const result = await db.query<Recipe>(query, [recipeName]);
    if (result.rows.length === 0) {
      return null;
    }
    const row = result.rows[0];
    return {
      ...row,
      formula: typeof row.formula === 'string' ? JSON.parse(row.formula) : row.formula
    };
  }

  async create(recipeData: CreateRecipeDTO): Promise<Recipe> {
    const query = `
      INSERT INTO recipes (recipe_name, formula, created_by)
      VALUES ($1, $2::jsonb, $3)
      RETURNING id, recipe_name, formula, created_at, updated_at, created_by, updated_by
    `;
    
    const values = [
      recipeData.recipe_name,
      JSON.stringify(recipeData.formula),
      recipeData.created_by || null
    ];

    try {
      const result = await db.query<Recipe>(query, values);
      const row = result.rows[0];
      logger.info('Recipe created', { id: row.id, recipe_name: row.recipe_name });
      return {
        ...row,
        formula: typeof row.formula === 'string' ? JSON.parse(row.formula) : row.formula
      };
    } catch (error) {
      logger.error('Error creating recipe', { error, recipeData });
      throw error;
    }
  }

  async update(id: string, recipeData: UpdateRecipeDTO): Promise<Recipe | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (recipeData.recipe_name !== undefined) {
      fields.push(`recipe_name = $${paramCount++}`);
      values.push(recipeData.recipe_name);
    }
    if (recipeData.formula !== undefined) {
      fields.push(`formula = $${paramCount++}::jsonb`);
      values.push(JSON.stringify(recipeData.formula));
    }
    if (recipeData.updated_by !== undefined) {
      fields.push(`updated_by = $${paramCount++}`);
      values.push(recipeData.updated_by);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE recipes
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, recipe_name, formula, created_at, updated_at, created_by, updated_by
    `;

    try {
      const result = await db.query<Recipe>(query, values);
      if (result.rows.length === 0) {
        return null;
      }
      const row = result.rows[0];
      logger.info('Recipe updated', { id });
      return {
        ...row,
        formula: typeof row.formula === 'string' ? JSON.parse(row.formula) : row.formula
      };
    } catch (error) {
      logger.error('Error updating recipe', { error, id });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM recipes WHERE id = $1';
    const result = await db.query(query, [id]);
    const deleted = (result.rowCount || 0) > 0;
    if (deleted) {
      logger.info('Recipe deleted', { id });
    }
    return deleted;
  }

  async nameExists(recipeName: string, excludeId?: string): Promise<boolean> {
    let query = 'SELECT 1 FROM recipes WHERE recipe_name = $1';
    const params: any[] = [recipeName];
    
    if (excludeId) {
      query += ' AND id != $2';
      params.push(excludeId);
    }
    
    const result = await db.query(query, params);
    return result.rows.length > 0;
  }

  async isUsedInProducts(recipeId: string): Promise<boolean> {
    const query = 'SELECT 1 FROM product_recipes WHERE recipe_id = $1 LIMIT 1';
    const result = await db.query(query, [recipeId]);
    return result.rows.length > 0;
  }
}

export const recipeDAO = new RecipeDAO();

