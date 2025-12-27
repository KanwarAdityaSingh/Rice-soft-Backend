import { Response, NextFunction } from 'express';
import { productDAO } from '../dao/product.dao';
import { productService } from '../services/product.service';
import { ResponseHandler } from '../utils/response';
import { validate, uuidSchema } from '../utils/validators';
import { AuthRequest } from '../middleware/auth.middleware';
import { CreateProductDTO, UpdateProductDTO, ProductResponse, ProductWithRecipesResponse } from '../models/product.model';
import { createProductSchema, updateProductSchema, addRecipeToProductSchema } from '../utils/validators';
import { NotFoundError } from '../utils/errors';

export class ProductController {
  async getAll(_req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const products = await productDAO.findAll();

      const productResponses: ProductWithRecipesResponse[] = await Promise.all(
        products.map(async (product) => {
          const recipes = await productDAO.getRecipes(product.id);
          return {
            id: product.id,
            name: product.name,
            description: product.description,
            brand: product.brand,
            created_at: product.created_at.toISOString(),
            updated_at: product.updated_at.toISOString(),
            recipes: recipes,
          };
        })
      );

      return ResponseHandler.success(res, productResponses);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      const product = await productDAO.findById(id);
      if (!product) {
        throw new NotFoundError('Product not found');
      }

      const recipes = await productDAO.getRecipes(id);

      const productResponse: ProductWithRecipesResponse = {
        id: product.id,
        name: product.name,
        description: product.description,
        brand: product.brand,
        created_at: product.created_at.toISOString(),
        updated_at: product.updated_at.toISOString(),
        recipes: recipes,
      };

      return ResponseHandler.success(res, productResponse);
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const productData = validate<CreateProductDTO>(createProductSchema, req.body);

      // Set created_by from authenticated user
      if (req.user) {
        productData.created_by = req.user.userId;
      }

      // Use productService to auto-create packaging entries
      const product = await productService.createProduct(productData);

      const productResponse: ProductResponse = {
        id: product.id,
        name: product.name,
        description: product.description,
        brand: product.brand,
        created_at: product.created_at.toISOString(),
        updated_at: product.updated_at.toISOString(),
      };

      return ResponseHandler.created(res, productResponse, 'Product created successfully with packaging entries (10kg, 25kg, 50kg)');
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const productData = validate<UpdateProductDTO>(updateProductSchema, req.body);

      // Set updated_by from authenticated user
      if (req.user) {
        productData.updated_by = req.user.userId;
      }

      const product = await productDAO.update(id, productData);
      if (!product) {
        throw new NotFoundError('Product not found');
      }

      const productResponse: ProductResponse = {
        id: product.id,
        name: product.name,
        description: product.description,
        brand: product.brand,
        created_at: product.created_at.toISOString(),
        updated_at: product.updated_at.toISOString(),
      };

      return ResponseHandler.success(res, productResponse, 'Product updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      const deleted = await productDAO.delete(id);
      if (!deleted) {
        throw new NotFoundError('Product not found');
      }

      return ResponseHandler.success(res, null, 'Product deleted successfully');
    } catch (error) {
      next(error);
    }
  }

  async addRecipe(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const productId = validate<string>(uuidSchema, req.params.id);
      const recipeData = validate<{ recipe_id: string; created_by?: string }>(addRecipeToProductSchema, req.body);

      const product = await productDAO.findById(productId);
      if (!product) {
        throw new NotFoundError('Product not found');
      }

      const added = await productDAO.addRecipe(productId, recipeData.recipe_id, req.user?.userId);
      if (!added) {
        return ResponseHandler.error(res, 'Recipe already added to product', 400);
      }

      return ResponseHandler.success(res, null, 'Recipe added to product successfully');
    } catch (error) {
      next(error);
    }
  }

  async getBrands(_req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const brands = [
        { value: 'Tamara', label: 'Tamara' },
        { value: 'Hariom', label: 'Hariom' }
      ];

      return ResponseHandler.success(res, brands);
    } catch (error) {
      next(error);
    }
  }

  async removeRecipe(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const productId = validate<string>(uuidSchema, req.params.id);
      const recipeId = validate<string>(uuidSchema, req.params.recipeId);

      const removed = await productDAO.removeRecipe(productId, recipeId);
      if (!removed) {
        throw new NotFoundError('Recipe not found in product');
      }

      return ResponseHandler.success(res, null, 'Recipe removed from product successfully');
    } catch (error) {
      next(error);
    }
  }
}

