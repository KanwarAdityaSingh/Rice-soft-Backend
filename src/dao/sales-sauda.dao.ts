import { db } from '../database/connection';
import {
  SalesSauda,
  CreateSalesSaudaDTO,
  UpdateSalesSaudaDTO,
  SalesSaudaStatus,
} from '../models/sales-sauda.model';
import { logger } from '../utils/logger';

function formatDateToLocalString(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  if (typeof date === 'string') return date;
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export class SalesSaudaDAO {
  async findAll(salesPartyId?: string, status?: SalesSaudaStatus): Promise<SalesSauda[]> {
    let query = `
      SELECT id, sales_party_id, status, order_number, TO_CHAR(sauda_date, 'YYYY-MM-DD') as sauda_date,
             notes, payment_terms, amount, created_at, updated_at, created_by, updated_by
      FROM sales_saudas
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 1;
    if (salesPartyId) {
      query += ` AND sales_party_id = $${paramCount++}`;
      params.push(salesPartyId);
    }
    if (status) {
      query += ` AND status = $${paramCount++}`;
      params.push(status);
    }
    query += ` ORDER BY created_at DESC`;
    const result = await db.query<SalesSauda>(query, params);
    return result.rows;
  }

  async findById(id: string): Promise<SalesSauda | null> {
    const query = `
      SELECT id, sales_party_id, status, order_number, TO_CHAR(sauda_date, 'YYYY-MM-DD') as sauda_date,
             notes, payment_terms, amount, created_at, updated_at, created_by, updated_by
      FROM sales_saudas
      WHERE id = $1
    `;
    const result = await db.query<SalesSauda>(query, [id]);
    return result.rows[0] || null;
  }

  async create(data: CreateSalesSaudaDTO): Promise<SalesSauda> {
    const query = `
      INSERT INTO sales_saudas (sales_party_id, status, sauda_date, notes, payment_terms, amount, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, sales_party_id, status, order_number, TO_CHAR(sauda_date, 'YYYY-MM-DD') as sauda_date,
                notes, payment_terms, amount, created_at, updated_at, created_by, updated_by
    `;
    const values = [
      data.sales_party_id,
      data.status || 'draft',
      data.sauda_date != null ? (typeof data.sauda_date === 'string' ? data.sauda_date : formatDateToLocalString(data.sauda_date as Date)) : null,
      data.notes || null,
      data.payment_terms ?? null,
      data.amount != null ? Number(data.amount) : 0,
      data.created_by || null,
    ];
    const result = await db.query<SalesSauda>(query, values);
    logger.info('Sales sauda created', { id: result.rows[0].id });
    return result.rows[0];
  }

  async update(id: string, data: UpdateSalesSaudaDTO): Promise<SalesSauda | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;
    if (data.sales_party_id !== undefined) {
      fields.push(`sales_party_id = $${paramCount++}`);
      values.push(data.sales_party_id);
    }
    if (data.status !== undefined) {
      fields.push(`status = $${paramCount++}`);
      values.push(data.status);
    }
    if (data.order_number !== undefined) {
      fields.push(`order_number = $${paramCount++}`);
      values.push(data.order_number ?? null);
    }
    if (data.sauda_date !== undefined) {
      fields.push(`sauda_date = $${paramCount++}`);
      values.push(
        data.sauda_date != null
          ? (typeof data.sauda_date === 'string' ? data.sauda_date : formatDateToLocalString(data.sauda_date as Date))
          : null
      );
    }
    if (data.notes !== undefined) {
      fields.push(`notes = $${paramCount++}`);
      values.push(data.notes ?? null);
    }
    if (data.payment_terms !== undefined) {
      fields.push(`payment_terms = $${paramCount++}`);
      values.push(data.payment_terms ?? null);
    }
    if (data.amount !== undefined) {
      fields.push(`amount = $${paramCount++}`);
      values.push(Number(data.amount));
    }
    if (data.updated_by !== undefined) {
      fields.push(`updated_by = $${paramCount++}`);
      values.push(data.updated_by);
    }
    if (fields.length === 0) return this.findById(id);
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    const query = `
      UPDATE sales_saudas SET ${fields.join(', ')} WHERE id = $${paramCount}
      RETURNING id, sales_party_id, status, order_number, TO_CHAR(sauda_date, 'YYYY-MM-DD') as sauda_date,
                notes, payment_terms, amount, created_at, updated_at, created_by, updated_by
    `;
    const result = await db.query<SalesSauda>(query, values);
    if (result.rows.length === 0) return null;
    logger.info('Sales sauda updated', { id });
    return result.rows[0];
  }

  async getNextOrderNumber(): Promise<string> {
    const query = `
      SELECT order_number FROM sales_saudas
      WHERE order_number IS NOT NULL AND order_number ~ '^SO-[0-9]+$'
      ORDER BY order_number DESC LIMIT 1
    `;
    const result = await db.query<{ order_number: string }>(query);
    if (result.rows.length === 0) return 'SO-001';
    const last = result.rows[0].order_number;
    const num = parseInt(last.replace('SO-', ''), 10);
    return `SO-${String(num + 1).padStart(3, '0')}`;
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.query('DELETE FROM sales_saudas WHERE id = $1', [id]);
    const deleted = (result.rowCount ?? 0) > 0;
    if (deleted) logger.info('Sales sauda deleted', { id });
    return deleted;
  }
}

export const salesSaudaDAO = new SalesSaudaDAO();
