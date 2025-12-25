import { Response, NextFunction } from 'express';
import { recipeDAO } from '../dao/recipe.dao';
import { ResponseHandler } from '../utils/response';
import { validate, uuidSchema } from '../utils/validators';
import { AuthRequest } from '../middleware/auth.middleware';
import { CreateRecipeDTO, UpdateRecipeDTO, RecipeResponse } from '../models/recipe.model';
import { createRecipeSchema, updateRecipeSchema } from '../utils/validators';
import { NotFoundError, ConflictError, BadRequestError } from '../utils/errors';

export class RecipeController {
  async getAll(_req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const recipes = await recipeDAO.findAll();

      const recipeResponses: RecipeResponse[] = recipes.map((recipe) => ({
        id: recipe.id,
        recipe_name: recipe.recipe_name,
        formula: recipe.formula,
        created_at: recipe.created_at.toISOString(),
        updated_at: recipe.updated_at.toISOString(),
      }));

      return ResponseHandler.success(res, recipeResponses);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      const recipe = await recipeDAO.findById(id);
      if (!recipe) {
        throw new NotFoundError('Recipe not found');
      }

      const recipeResponse: RecipeResponse = {
        id: recipe.id,
        recipe_name: recipe.recipe_name,
        formula: recipe.formula,
        created_at: recipe.created_at.toISOString(),
        updated_at: recipe.updated_at.toISOString(),
      };

      return ResponseHandler.success(res, recipeResponse);
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const recipeData = validate<CreateRecipeDTO>(createRecipeSchema, req.body);

      // Validate formula percentages sum to 100
      const formulaSum = recipeData.formula.reduce((sum, item) => sum + item.percentage, 0);
      if (Math.abs(formulaSum - 100) > 0.01) {
        throw new BadRequestError(`Recipe formula percentages must sum to 100%, got ${formulaSum}%`);
      }

      // Check if recipe name already exists
      const nameExists = await recipeDAO.nameExists(recipeData.recipe_name);
      if (nameExists) {
        throw new ConflictError('Recipe with this name already exists');
      }

      // Set created_by from authenticated user
      if (req.user) {
        recipeData.created_by = req.user.userId;
      }

      const recipe = await recipeDAO.create(recipeData);

      const recipeResponse: RecipeResponse = {
        id: recipe.id,
        recipe_name: recipe.recipe_name,
        formula: recipe.formula,
        created_at: recipe.created_at.toISOString(),
        updated_at: recipe.updated_at.toISOString(),
      };

      return ResponseHandler.created(res, recipeResponse, 'Recipe created successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const recipeData = validate<UpdateRecipeDTO>(updateRecipeSchema, req.body);

      const existingRecipe = await recipeDAO.findById(id);
      if (!existingRecipe) {
        throw new NotFoundError('Recipe not found');
      }

      // Validate formula if being updated
      if (recipeData.formula) {
        const formulaSum = recipeData.formula.reduce((sum, item) => sum + item.percentage, 0);
        if (Math.abs(formulaSum - 100) > 0.01) {
          throw new BadRequestError(`Recipe formula percentages must sum to 100%, got ${formulaSum}%`);
        }
      }

      // Check if name conflicts (if being updated)
      if (recipeData.recipe_name && recipeData.recipe_name !== existingRecipe.recipe_name) {
        const nameExists = await recipeDAO.nameExists(recipeData.recipe_name, id);
        if (nameExists) {
          throw new ConflictError('Recipe with this name already exists');
        }
      }

      // Set updated_by from authenticated user
      if (req.user) {
        recipeData.updated_by = req.user.userId;
      }

      const recipe = await recipeDAO.update(id, recipeData);
      if (!recipe) {
        throw new NotFoundError('Recipe not found after update');
      }

      const recipeResponse: RecipeResponse = {
        id: recipe.id,
        recipe_name: recipe.recipe_name,
        formula: recipe.formula,
        created_at: recipe.created_at.toISOString(),
        updated_at: recipe.updated_at.toISOString(),
      };

      return ResponseHandler.success(res, recipeResponse, 'Recipe updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      const recipe = await recipeDAO.findById(id);
      if (!recipe) {
        throw new NotFoundError('Recipe not found');
      }

      // Check if recipe is used in products
      const isUsed = await recipeDAO.isUsedInProducts(id);
      if (isUsed) {
        throw new ConflictError('Cannot delete recipe that is used in products');
      }

      const deleted = await recipeDAO.delete(id);
      if (!deleted) {
        throw new NotFoundError('Recipe not found after deletion');
      }

      return ResponseHandler.success(res, null, 'Recipe deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

