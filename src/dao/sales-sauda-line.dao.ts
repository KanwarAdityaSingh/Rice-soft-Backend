import { db } from '../database/connection';
import {
  SalesSaudaLine,
  CreateSalesSaudaLineDTO,
  UpdateSalesSaudaLineDTO,
} from '../models/sales-sauda-line.model';
import { logger } from '../utils/logger';

export class SalesSaudaLineDAO {
  async findBySalesSaudaId(salesSaudaId: string): Promise<SalesSaudaLine[]> {
    const query = `
      SELECT id, sales_sauda_id, product_id, packaging_id, quantity, quantity_unit, rate, amount, sort_order,
             created_at, updated_at
      FROM sales_sauda_lines
      WHERE sales_sauda_id = $1
      ORDER BY sort_order ASC, created_at ASC
    `;
    const result = await db.query<SalesSaudaLine>(query, [salesSaudaId]);
    return result.rows;
  }

  async findById(id: string): Promise<SalesSaudaLine | null> {
    const query = `
      SELECT id, sales_sauda_id, product_id, packaging_id, quantity, quantity_unit, rate, amount, sort_order,
             created_at, updated_at
      FROM sales_sauda_lines WHERE id = $1
    `;
    const result = await db.query<SalesSaudaLine>(query, [id]);
    return result.rows[0] || null;
  }

  async create(salesSaudaId: string, data: CreateSalesSaudaLineDTO): Promise<SalesSaudaLine> {
    const amount = Number((data.quantity * data.rate).toFixed(2));
    const query = `
      INSERT INTO sales_sauda_lines (sales_sauda_id, product_id, packaging_id, quantity, quantity_unit, rate, amount, sort_order)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, sales_sauda_id, product_id, packaging_id, quantity, quantity_unit, rate, amount, sort_order, created_at, updated_at
    `;
    const values = [
      salesSaudaId,
      data.product_id,
      data.packaging_id || null,
      data.quantity,
      data.quantity_unit || 'kg',
      data.rate,
      amount,
      data.sort_order ?? 0,
    ];
    const result = await db.query<SalesSaudaLine>(query, values);
    logger.info('Sales sauda line created', { id: result.rows[0].id });
    return result.rows[0];
  }

  async createMany(salesSaudaId: string, lines: CreateSalesSaudaLineDTO[], sortStart = 0): Promise<SalesSaudaLine[]> {
    const created: SalesSaudaLine[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = await this.create(salesSaudaId, { ...lines[i], sort_order: lines[i].sort_order ?? sortStart + i });
      created.push(line);
    }
    return created;
  }

  async update(id: string, data: UpdateSalesSaudaLineDTO): Promise<SalesSaudaLine | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    const quantity = data.quantity ?? existing.quantity;
    const rate = data.rate ?? existing.rate;
    const amount = Number((quantity * rate).toFixed(2));
    const fields: string[] = ['amount = $1'];
    const values: any[] = [amount];
    let paramCount = 2;
    if (data.product_id !== undefined) {
      fields.push(`product_id = $${paramCount++}`);
      values.push(data.product_id);
    }
    if (data.packaging_id !== undefined) {
      fields.push(`packaging_id = $${paramCount++}`);
      values.push(data.packaging_id ?? null);
    }
    if (data.quantity !== undefined) {
      fields.push(`quantity = $${paramCount++}`);
      values.push(data.quantity);
    }
    if (data.quantity_unit !== undefined) {
      fields.push(`quantity_unit = $${paramCount++}`);
      values.push(data.quantity_unit);
    }
    if (data.rate !== undefined) {
      fields.push(`rate = $${paramCount++}`);
      values.push(data.rate);
    }
    if (data.sort_order !== undefined) {
      fields.push(`sort_order = $${paramCount++}`);
      values.push(data.sort_order);
    }
    values.push(id);
    const query = `
      UPDATE sales_sauda_lines SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount}
      RETURNING id, sales_sauda_id, product_id, packaging_id, quantity, quantity_unit, rate, amount, sort_order, created_at, updated_at
    `;
    const result = await db.query<SalesSaudaLine>(query, values);
    if (result.rows.length === 0) return null;
    logger.info('Sales sauda line updated', { id });
    return result.rows[0];
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.query('DELETE FROM sales_sauda_lines WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async deleteBySalesSaudaId(salesSaudaId: string): Promise<number> {
    const result = await db.query('DELETE FROM sales_sauda_lines WHERE sales_sauda_id = $1', [salesSaudaId]);
    return result.rowCount ?? 0;
  }
}

export const salesSaudaLineDAO = new SalesSaudaLineDAO();
