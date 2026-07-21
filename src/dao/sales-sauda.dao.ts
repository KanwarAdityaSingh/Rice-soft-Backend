import { db } from '../database/connection';
import {
  SalesSauda,
  CreateSalesSaudaDTO,
  UpdateSalesSaudaDTO,
  SalesSaudaStatus,
  SalesMovementType,
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

const SALES_SAUDA_SELECT = `
  ss.id, ss.sales_party_id, ss.salesman_id, sm.name as salesman_name,
  ss.salesman_commission_type, ss.salesman_commission_config,
  ss.sauda_type, ss.movement_type, ss.from_godown_id, ss.to_godown_id,
  ss.status, ss.order_number, TO_CHAR(ss.sauda_date, 'YYYY-MM-DD') as sauda_date,
  ss.financial_year, ss.billing_address, ss.delivery_address,
  ss.notes, ss.payment_terms, ss.amount,
  ss.created_at, ss.updated_at, ss.created_by, ss.updated_by
`;

export class SalesSaudaDAO {
  async findAll(
    salesPartyId?: string,
    status?: SalesSaudaStatus,
    financialYear?: string,
    movementType?: SalesMovementType | 'all'
  ): Promise<SalesSauda[]> {
    let query = `
      SELECT ${SALES_SAUDA_SELECT}
      FROM sales_saudas ss
      LEFT JOIN salesmen sm ON sm.id = ss.salesman_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 1;
    if (salesPartyId) {
      query += ` AND ss.sales_party_id = $${paramCount++}`;
      params.push(salesPartyId);
    }
    if (status) {
      query += ` AND ss.status = $${paramCount++}`;
      params.push(status);
    }
    if (financialYear) {
      query += ` AND ss.financial_year = $${paramCount++}`;
      params.push(financialYear);
    }
    // Default: customer sales only (exclude godown transfers from normal lists)
    if (movementType === undefined || movementType === 'sale') {
      query += ` AND ss.movement_type = $${paramCount++}`;
      params.push('sale');
    } else if (movementType === 'godown_transfer') {
      query += ` AND ss.movement_type = $${paramCount++}`;
      params.push('godown_transfer');
    }
    // movementType === 'all' → no filter
    query += ` ORDER BY ss.created_at DESC`;
    const result = await db.query<SalesSauda>(query, params);
    return result.rows;
  }

  async findById(id: string): Promise<SalesSauda | null> {
    const query = `
      SELECT ${SALES_SAUDA_SELECT}
      FROM sales_saudas ss
      LEFT JOIN salesmen sm ON sm.id = ss.salesman_id
      WHERE ss.id = $1
    `;
    const result = await db.query<SalesSauda>(query, [id]);
    return result.rows[0] || null;
  }

  async create(data: CreateSalesSaudaDTO): Promise<SalesSauda> {
    const query = `
      INSERT INTO sales_saudas (
        sales_party_id, salesman_id, salesman_commission_type, salesman_commission_config,
        sauda_type, movement_type, from_godown_id, to_godown_id,
        status, sauda_date, financial_year,
        billing_address, delivery_address,
        notes, payment_terms, amount, created_by
      )
      VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING id
    `;
    const values = [
      data.sales_party_id,
      data.salesman_id ?? null,
      data.salesman_commission_type ?? null,
      data.salesman_commission_config != null
        ? JSON.stringify(data.salesman_commission_config)
        : null,
      data.sauda_type,
      data.movement_type ?? 'sale',
      data.from_godown_id ?? null,
      data.to_godown_id ?? null,
      data.status || 'draft',
      data.sauda_date != null
        ? typeof data.sauda_date === 'string'
          ? data.sauda_date
          : formatDateToLocalString(data.sauda_date as Date)
        : null,
      data.financial_year,
      data.billing_address != null ? JSON.stringify(data.billing_address) : null,
      data.delivery_address != null ? JSON.stringify(data.delivery_address) : null,
      data.notes || null,
      data.payment_terms ?? null,
      data.amount != null ? Number(data.amount) : 0,
      data.created_by || null,
    ];
    const result = await db.query<{ id: string }>(query, values);
    logger.info('Sales sauda created', {
      id: result.rows[0].id,
      financialYear: data.financial_year,
      movementType: data.movement_type ?? 'sale',
    });
    return (await this.findById(result.rows[0].id))!;
  }

  async update(id: string, data: UpdateSalesSaudaDTO): Promise<SalesSauda | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;
    if (data.sales_party_id !== undefined) {
      fields.push(`sales_party_id = $${paramCount++}`);
      values.push(data.sales_party_id);
    }
    if (data.salesman_id !== undefined) {
      fields.push(`salesman_id = $${paramCount++}`);
      values.push(data.salesman_id ?? null);
    }
    if (data.salesman_commission_type !== undefined) {
      fields.push(`salesman_commission_type = $${paramCount++}`);
      values.push(data.salesman_commission_type ?? null);
    }
    if (data.salesman_commission_config !== undefined) {
      fields.push(`salesman_commission_config = $${paramCount++}`);
      values.push(
        data.salesman_commission_config != null
          ? JSON.stringify(data.salesman_commission_config)
          : null
      );
    }
    if (data.sauda_type !== undefined) {
      fields.push(`sauda_type = $${paramCount++}`);
      values.push(data.sauda_type);
    }
    if (data.movement_type !== undefined) {
      fields.push(`movement_type = $${paramCount++}`);
      values.push(data.movement_type);
    }
    if (data.from_godown_id !== undefined) {
      fields.push(`from_godown_id = $${paramCount++}`);
      values.push(data.from_godown_id ?? null);
    }
    if (data.to_godown_id !== undefined) {
      fields.push(`to_godown_id = $${paramCount++}`);
      values.push(data.to_godown_id ?? null);
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
          ? typeof data.sauda_date === 'string'
            ? data.sauda_date
            : formatDateToLocalString(data.sauda_date as Date)
          : null
      );
    }
    if (data.financial_year !== undefined) {
      fields.push(`financial_year = $${paramCount++}`);
      values.push(data.financial_year);
    }
    if (data.billing_address !== undefined) {
      fields.push(`billing_address = $${paramCount++}`);
      values.push(data.billing_address != null ? JSON.stringify(data.billing_address) : null);
    }
    if (data.delivery_address !== undefined) {
      fields.push(`delivery_address = $${paramCount++}`);
      values.push(data.delivery_address != null ? JSON.stringify(data.delivery_address) : null);
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
      RETURNING id
    `;
    const result = await db.query<{ id: string }>(query, values);
    if (result.rows.length === 0) return null;
    logger.info('Sales sauda updated', { id });
    return this.findById(id);
  }

  /** Next SO-NNN within the given Indian financial year. */
  async getNextOrderNumber(financialYear: string): Promise<string> {
    const query = `
      SELECT order_number FROM sales_saudas
      WHERE financial_year = $1
        AND order_number IS NOT NULL
        AND order_number ~ '^SO-[0-9]+$'
      ORDER BY order_number DESC
      LIMIT 1
    `;
    const result = await db.query<{ order_number: string }>(query, [financialYear]);
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
