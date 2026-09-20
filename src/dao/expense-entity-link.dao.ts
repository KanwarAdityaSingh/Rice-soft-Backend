import { db } from '../database/connection';
import { ExpenseEntityLink, CreateExpenseEntityLinkDTO } from '../models/expense.model';

export class ExpenseEntityLinkDAO {
  async findByExpenseId(expenseId: string): Promise<ExpenseEntityLink[]> {
    const query = `
      SELECT * FROM expense_entity_links
      WHERE expense_id = $1
      ORDER BY created_at ASC
    `;
    const result = await db.query(query, [expenseId]);
    return result.rows;
  }

  async findByExpenseIds(expenseIds: string[]): Promise<Map<string, ExpenseEntityLink[]>> {
    if (expenseIds.length === 0) {
      return new Map();
    }

    const query = `
      SELECT * FROM expense_entity_links
      WHERE expense_id = ANY($1)
      ORDER BY expense_id, created_at ASC
    `;
    const result = await db.query(query, [expenseIds]);

    const linksByExpense = new Map<string, ExpenseEntityLink[]>();
    for (const row of result.rows) {
      const expenseId = row.expense_id;
      if (!linksByExpense.has(expenseId)) {
        linksByExpense.set(expenseId, []);
      }
      linksByExpense.get(expenseId)!.push(row);
    }

    return linksByExpense;
  }

  async findByEntity(entityType: string, entityId: string): Promise<ExpenseEntityLink | null> {
    const query = `
      SELECT * FROM expense_entity_links
      WHERE entity_type = $1 AND entity_id = $2
    `;
    const result = await db.query(query, [entityType, entityId]);
    return result.rows[0] || null;
  }

  async findLinkedExpensesByEntities(
    entityType: string,
    entityIds: string[]
  ): Promise<Map<string, string>> {
    if (entityIds.length === 0) {
      return new Map();
    }

    const query = `
      SELECT entity_id, expense_id
      FROM expense_entity_links
      WHERE entity_type = $1 AND entity_id = ANY($2)
    `;
    const result = await db.query(query, [entityType, entityIds]);

    const linkedExpenses = new Map<string, string>();
    for (const row of result.rows) {
      linkedExpenses.set(row.entity_id, row.expense_id);
    }

    return linkedExpenses;
  }

  async create(expenseId: string, data: CreateExpenseEntityLinkDTO): Promise<ExpenseEntityLink> {
    const query = `
      INSERT INTO expense_entity_links (expense_id, entity_type, entity_id)
      VALUES ($1, $2, $3)
      RETURNING *
    `;

    const values = [expenseId, data.entity_type, data.entity_id];
    const result = await db.query(query, values);
    return result.rows[0];
  }

  async createMany(expenseId: string, links: CreateExpenseEntityLinkDTO[]): Promise<ExpenseEntityLink[]> {
    if (links.length === 0) {
      return [];
    }

    const values: unknown[] = [];
    const valueSets: string[] = [];
    let paramCount = 1;

    for (const link of links) {
      valueSets.push(`($${paramCount++}, $${paramCount++}, $${paramCount++})`);
      values.push(expenseId, link.entity_type, link.entity_id);
    }

    const query = `
      INSERT INTO expense_entity_links (expense_id, entity_type, entity_id)
      VALUES ${valueSets.join(', ')}
      RETURNING *
    `;

    const result = await db.query(query, values);
    return result.rows;
  }

  async deleteByExpenseId(expenseId: string): Promise<boolean> {
    const query = 'DELETE FROM expense_entity_links WHERE expense_id = $1';
    const result = await db.query(query, [expenseId]);
    return (result.rowCount ?? 0) > 0;
  }

  async isEntityLinked(entityType: string, entityId: string): Promise<boolean> {
    const query = `
      SELECT EXISTS(
        SELECT 1 FROM expense_entity_links
        WHERE entity_type = $1 AND entity_id = $2
      ) as is_linked
    `;
    const result = await db.query(query, [entityType, entityId]);
    return result.rows[0].is_linked;
  }
}

export const expenseEntityLinkDAO = new ExpenseEntityLinkDAO();
