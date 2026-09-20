import { expenseCategoryDAO } from '../dao/expense-category.dao';
import {
  ExpenseCategory,
  CreateExpenseCategoryDTO,
  UpdateExpenseCategoryDTO,
  ExpenseCategoryResponse,
} from '../models/expense-category.model';
import { ConflictError, NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';

export function toExpenseCategoryResponse(category: ExpenseCategory): ExpenseCategoryResponse {
  return {
    id: category.id,
    name: category.name,
    code: category.code,
    description: category.description,
    is_active: category.is_active,
    created_at: category.created_at.toISOString(),
    updated_at: category.updated_at.toISOString(),
  };
}

/**
 * Generate a category code from the name
 * Takes first 6 uppercase alphanumeric characters, removes spaces/special chars
 */
function generateCodeFromName(name: string): string {
  // Remove special characters, keep only alphanumeric
  const cleaned = name.toUpperCase().replace(/[^A-Z0-9]/g, '');
  // Take first 6 characters, minimum 2
  const code = cleaned.substring(0, 6);
  if (code.length < 2) {
    throw new Error('Category name must contain at least 2 alphanumeric characters');
  }
  return code;
}

export class ExpenseCategoryService {
  async createCategory(data: CreateExpenseCategoryDTO): Promise<ExpenseCategory> {
    // Auto-generate code if not provided
    const code = data.code || generateCodeFromName(data.name);
    
    // Check for duplicate name
    const existingByName = await expenseCategoryDAO.findAll({
      search: data.name,
      includeInactive: true,
      limit: 1,
      offset: 0,
    });

    if (existingByName.rows.some((cat) => cat.name === data.name)) {
      throw new ConflictError('Category with this name already exists');
    }

    // Check for duplicate code
    const existingByCode = await expenseCategoryDAO.findByCode(code);
    if (existingByCode) {
      throw new ConflictError(`Category with code '${code}' already exists. Please provide a custom code.`);
    }

    const category = await expenseCategoryDAO.create({
      ...data,
      code,
    });

    logger.info('Expense category created', {
      category_id: category.id,
      name: category.name,
      code: category.code,
    });

    return category;
  }

  async updateCategory(id: string, data: UpdateExpenseCategoryDTO): Promise<ExpenseCategory> {
    const existing = await expenseCategoryDAO.findById(id);
    if (!existing) {
      throw new NotFoundError('Expense category not found');
    }

    // Check for name conflict if changing name
    if (data.name && data.name !== existing.name) {
      const duplicateName = await expenseCategoryDAO.findAll({
        search: data.name,
        includeInactive: true,
        limit: 1,
        offset: 0,
      });

      if (duplicateName.rows.some((cat) => cat.name === data.name && cat.id !== id)) {
        throw new ConflictError('Category with this name already exists');
      }
    }

    // Check for code conflict if changing code
    if (data.code && data.code !== existing.code) {
      const duplicateCode = await expenseCategoryDAO.findByCode(data.code);
      if (duplicateCode && duplicateCode.id !== id) {
        throw new ConflictError('Category with this code already exists');
      }
    }

    const updated = await expenseCategoryDAO.update(id, data);
    if (!updated) {
      throw new NotFoundError('Expense category not found after update');
    }

    logger.info('Expense category updated', {
      category_id: updated.id,
      name: updated.name,
      code: updated.code,
    });

    return updated;
  }

  async getById(id: string): Promise<ExpenseCategory> {
    const category = await expenseCategoryDAO.findById(id);
    if (!category) {
      throw new NotFoundError('Expense category not found');
    }
    return category;
  }

  async softDelete(id: string): Promise<ExpenseCategory> {
    const existing = await expenseCategoryDAO.findById(id);
    if (!existing) {
      throw new NotFoundError('Expense category not found');
    }

    const updated = await expenseCategoryDAO.update(id, { is_active: false });
    if (!updated) {
      throw new NotFoundError('Expense category not found after update');
    }

    logger.info('Expense category soft deleted', {
      category_id: updated.id,
      name: updated.name,
    });

    return updated;
  }
}

export const expenseCategoryService = new ExpenseCategoryService();
