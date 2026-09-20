import { Response, NextFunction } from 'express';
import { expenseCategoryDAO } from '../dao/expense-category.dao';
import { expenseCategoryService, toExpenseCategoryResponse } from '../services/expense-category.service';
import { ResponseHandler } from '../utils/response';
import { parsePaginationQuery, toPaginatedResult } from '../utils/pagination';
import { parseSearchQuery } from '../utils/search';
import {
  validate,
  uuidSchema,
  createExpenseCategorySchema,
  updateExpenseCategorySchema,
} from '../utils/validators';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  CreateExpenseCategoryDTO,
  UpdateExpenseCategoryDTO,
  ExpenseCategoryResponse,
} from '../models/expense-category.model';

export class ExpenseCategoryController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const includeInactive = req.query.include_inactive === 'true';
      const search = parseSearchQuery(req.query);
      const { page, limit, offset } = parsePaginationQuery(req.query);

      const { rows, total } = await expenseCategoryDAO.findAll({
        includeInactive,
        search,
        limit,
        offset,
      });

      const responses: ExpenseCategoryResponse[] = rows.map(toExpenseCategoryResponse);

      return ResponseHandler.success(res, toPaginatedResult(responses, total, page, limit));
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const category = await expenseCategoryService.getById(id);
      return ResponseHandler.success(res, toExpenseCategoryResponse(category));
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const validated = validate<CreateExpenseCategoryDTO>(createExpenseCategorySchema, req.body);
      const data: CreateExpenseCategoryDTO = {
        ...validated,
        created_by: req.user?.userId,
      };

      const category = await expenseCategoryService.createCategory(data);
      return ResponseHandler.created(
        res,
        toExpenseCategoryResponse(category),
        'Expense category created successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const validated = validate<UpdateExpenseCategoryDTO>(updateExpenseCategorySchema, req.body);
      const data: UpdateExpenseCategoryDTO = {
        ...validated,
        updated_by: req.user?.userId,
      };

      const category = await expenseCategoryService.updateCategory(id, data);
      return ResponseHandler.success(
        res,
        toExpenseCategoryResponse(category),
        'Expense category updated successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const category = await expenseCategoryService.softDelete(id);
      return ResponseHandler.success(
        res,
        toExpenseCategoryResponse(category),
        'Expense category deleted successfully'
      );
    } catch (error) {
      next(error);
    }
  }
}

export const expenseCategoryController = new ExpenseCategoryController();
