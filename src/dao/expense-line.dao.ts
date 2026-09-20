import { db } from '../database/connection';
import { ExpenseLine, CreateExpenseLineDTO } from '../models/expense.model';

export class ExpenseLineDAO {
  async findByExpenseId(expenseId: string): Promise<ExpenseLine[]> {
    const query = `
      SELECT * FROM expense_lines
      WHERE expense_id = $1
      ORDER BY line_number ASC
    `;
    const result = await db.query(query, [expenseId]);
    return result.rows;
  }

  async findByExpenseIds(expenseIds: string[]): Promise<Map<string, ExpenseLine[]>> {
    if (expenseIds.length === 0) {
      return new Map();
    }

    const query = `
      SELECT * FROM expense_lines
      WHERE expense_id = ANY($1)
      ORDER BY expense_id, line_number ASC
    `;
    const result = await db.query(query, [expenseIds]);

    const linesByExpense = new Map<string, ExpenseLine[]>();
    for (const row of result.rows) {
      const expenseId = row.expense_id;
      if (!linesByExpense.has(expenseId)) {
        linesByExpense.set(expenseId, []);
      }
      linesByExpense.get(expenseId)!.push(row);
    }

    return linesByExpense;
  }

  async create(expenseId: string, data: CreateExpenseLineDTO): Promise<ExpenseLine> {
    const query = `
      INSERT INTO expense_lines (
        expense_id, line_number, description, quantity, unit, rate, amount,
        reference_number, reference_date, vehicle_number, from_location, to_location
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;

    const values = [
      expenseId,
      data.line_number,
      data.description,
      data.quantity || null,
      data.unit || null,
      data.rate || null,
      data.amount,
      data.reference_number || null,
      data.reference_date || null,
      data.vehicle_number || null,
      data.from_location || null,
      data.to_location || null,
    ];

    const result = await db.query(query, values);
    return result.rows[0];
  }

  async createMany(expenseId: string, lines: CreateExpenseLineDTO[]): Promise<ExpenseLine[]> {
    if (lines.length === 0) {
      return [];
    }

    const values: unknown[] = [];
    const valueSets: string[] = [];
    let paramCount = 1;

    for (const line of lines) {
      valueSets.push(
        `($${paramCount++}, $${paramCount++}, $${paramCount++}, $${paramCount++}, $${paramCount++}, $${paramCount++}, $${paramCount++}, $${paramCount++}, $${paramCount++}, $${paramCount++}, $${paramCount++}, $${paramCount++})`
      );
      values.push(
        expenseId,
        line.line_number,
        line.description,
        line.quantity || null,
        line.unit || null,
        line.rate || null,
        line.amount,
        line.reference_number || null,
        line.reference_date || null,
        line.vehicle_number || null,
        line.from_location || null,
        line.to_location || null
      );
    }

    const query = `
      INSERT INTO expense_lines (
        expense_id, line_number, description, quantity, unit, rate, amount,
        reference_number, reference_date, vehicle_number, from_location, to_location
      )
      VALUES ${valueSets.join(', ')}
      RETURNING *
    `;

    const result = await db.query(query, values);
    return result.rows;
  }

  async deleteByExpenseId(expenseId: string): Promise<boolean> {
    const query = 'DELETE FROM expense_lines WHERE expense_id = $1';
    const result = await db.query(query, [expenseId]);
    return (result.rowCount ?? 0) > 0;
  }

  async calculateSubtotal(expenseId: string): Promise<number> {
    const query = `
      SELECT COALESCE(SUM(amount), 0) as subtotal
      FROM expense_lines
      WHERE expense_id = $1
    `;
    const result = await db.query(query, [expenseId]);
    return parseFloat(result.rows[0].subtotal);
  }
}

export const expenseLineDAO = new ExpenseLineDAO();
