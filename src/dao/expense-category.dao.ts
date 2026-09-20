import { db } from '../database/connection';
import {
  ExpenseCategory,
  CreateExpenseCategoryDTO,
  UpdateExpenseCategoryDTO,
} from '../models/expense-category.model';
import { buildNormalizedSearchClause } from '../utils/search';

export interface ExpenseCategoryListFilters {
  includeInactive?: boolean;
  search?: string;
  limit: number;
  offset: number;
}

export class ExpenseCategoryDAO {
  async findAll(filters: ExpenseCategoryListFilters): Promise<{ rows: ExpenseCategory[]; total: number }> {
    const { includeInactive = false, search, limit, offset } = filters;

    let where = `WHERE 1=1`;
    const params: unknown[] = [];
    let paramCount = 1;

    if (!includeInactive) {
      where += ` AND is_active = true`;
    }

    const searchClause = buildNormalizedSearchClause(
      ['name', 'code', 'description'],
      search,
      paramCount
    );
    where += searchClause.sql;
    params.push(...searchClause.params);
    paramCount = searchClause.nextParamIndex;

    const countQuery = `SELECT COUNT(*) as count FROM expense_categories ${where}`;
    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count, 10);

    params.push(limit, offset);
    const query = `
      SELECT *
      FROM expense_categories
      ${where}
      ORDER BY name ASC
      LIMIT $${paramCount++} OFFSET $${paramCount++}
    `;

    const result = await db.query(query, params);
    return { rows: result.rows, total };
  }

  async findById(id: string): Promise<ExpenseCategory | null> {
    const query = 'SELECT * FROM expense_categories WHERE id = $1';
    const result = await db.query(query, [id]);
    return result.rows[0] || null;
  }

  async findByCode(code: string): Promise<ExpenseCategory | null> {
    const query = 'SELECT * FROM expense_categories WHERE code = $1';
    const result = await db.query(query, [code]);
    return result.rows[0] || null;
  }

  async create(data: CreateExpenseCategoryDTO): Promise<ExpenseCategory> {
    const query = `
      INSERT INTO expense_categories (name, code, description, created_by)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const values = [data.name, data.code, data.description || null, data.created_by || null];
    const result = await db.query(query, values);
    return result.rows[0];
  }

  async update(id: string, data: UpdateExpenseCategoryDTO): Promise<ExpenseCategory | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${paramCount++}`);
      values.push(data.name);
    }

    if (data.code !== undefined) {
      fields.push(`code = $${paramCount++}`);
      values.push(data.code);
    }

    if (data.description !== undefined) {
      fields.push(`description = $${paramCount++}`);
      values.push(data.description);
    }

    if (data.is_active !== undefined) {
      fields.push(`is_active = $${paramCount++}`);
      values.push(data.is_active);
    }

    if (data.updated_by !== undefined) {
      fields.push(`updated_by = $${paramCount++}`);
      values.push(data.updated_by);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);

    if (fields.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const query = `
      UPDATE expense_categories
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await db.query(query, values);
    return result.rows[0] || null;
  }

  async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM expense_categories WHERE id = $1';
    const result = await db.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }
}

export const expenseCategoryDAO = new ExpenseCategoryDAO();
