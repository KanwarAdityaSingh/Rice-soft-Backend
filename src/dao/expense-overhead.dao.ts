import { db } from '../database/connection';
import { ExpenseOverhead, CreateExpenseOverheadDTO } from '../models/expense.model';

export class ExpenseOverheadDAO {
  async findByExpenseId(expenseId: string): Promise<ExpenseOverhead[]> {
    const query = `
      SELECT * FROM expense_overheads
      WHERE expense_id = $1
      ORDER BY created_at ASC
    `;
    const result = await db.query(query, [expenseId]);
    return result.rows;
  }

  async findByExpenseIds(expenseIds: string[]): Promise<Map<string, ExpenseOverhead[]>> {
    if (expenseIds.length === 0) {
      return new Map();
    }

    const query = `
      SELECT * FROM expense_overheads
      WHERE expense_id = ANY($1)
      ORDER BY expense_id, created_at ASC
    `;
    const result = await db.query(query, [expenseIds]);

    const overheadsByExpense = new Map<string, ExpenseOverhead[]>();
    for (const row of result.rows) {
      const expenseId = row.expense_id;
      if (!overheadsByExpense.has(expenseId)) {
        overheadsByExpense.set(expenseId, []);
      }
      overheadsByExpense.get(expenseId)!.push(row);
    }

    return overheadsByExpense;
  }

  async create(expenseId: string, data: CreateExpenseOverheadDTO): Promise<ExpenseOverhead> {
    const query = `
      INSERT INTO expense_overheads (expense_id, charge_name, charge_amount)
      VALUES ($1, $2, $3)
      RETURNING *
    `;

    const values = [expenseId, data.charge_name, data.charge_amount];
    const result = await db.query(query, values);
    return result.rows[0];
  }

  async createMany(expenseId: string, overheads: CreateExpenseOverheadDTO[]): Promise<ExpenseOverhead[]> {
    if (overheads.length === 0) {
      return [];
    }

    const values: unknown[] = [];
    const valueSets: string[] = [];
    let paramCount = 1;

    for (const overhead of overheads) {
      valueSets.push(`($${paramCount++}, $${paramCount++}, $${paramCount++})`);
      values.push(expenseId, overhead.charge_name, overhead.charge_amount);
    }

    const query = `
      INSERT INTO expense_overheads (expense_id, charge_name, charge_amount)
      VALUES ${valueSets.join(', ')}
      RETURNING *
    `;

    const result = await db.query(query, values);
    return result.rows;
  }

  async deleteByExpenseId(expenseId: string): Promise<boolean> {
    const query = 'DELETE FROM expense_overheads WHERE expense_id = $1';
    const result = await db.query(query, [expenseId]);
    return (result.rowCount ?? 0) > 0;
  }

  async calculateTotal(expenseId: string): Promise<number> {
    const query = `
      SELECT COALESCE(SUM(charge_amount), 0) as total
      FROM expense_overheads
      WHERE expense_id = $1
    `;
    const result = await db.query(query, [expenseId]);
    return parseFloat(result.rows[0].total);
  }
}

export const expenseOverheadDAO = new ExpenseOverheadDAO();
