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
      SELECT id, sales_sauda_id, product_id, packaging_id, packet_count, quantity, quantity_unit, rate,
             discount_value, discount_type, gst_percent, amount, discount_amount, gst_amount, final_amount, sort_order,
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
      SELECT id, sales_sauda_id, product_id, packaging_id, packet_count, quantity, quantity_unit, rate,
             discount_value, discount_type, gst_percent, amount, discount_amount, gst_amount, final_amount, sort_order,
             created_at, updated_at
      FROM sales_sauda_lines WHERE id = $1
    `;
    const result = await db.query<SalesSaudaLine>(query, [id]);
    return result.rows[0] || null;
  }

  async create(salesSaudaId: string, data: CreateSalesSaudaLineDTO): Promise<SalesSaudaLine> {
    if (data.quantity === undefined) {
      throw new Error('Quantity is required to create sales sauda line');
    }
    if (data.amount === undefined || data.discount_amount === undefined || data.gst_amount === undefined || data.final_amount === undefined) {
      throw new Error('Computed line amounts are required to create sales sauda line');
    }
    const query = `
      INSERT INTO sales_sauda_lines (
        sales_sauda_id, product_id, packaging_id, packet_count, quantity, quantity_unit, rate,
        discount_value, discount_type, gst_percent, amount, discount_amount, gst_amount, final_amount, sort_order
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id, sales_sauda_id, product_id, packaging_id, packet_count, quantity, quantity_unit, rate,
                discount_value, discount_type, gst_percent, amount, discount_amount, gst_amount, final_amount, sort_order, created_at, updated_at
    `;
    const values = [
      salesSaudaId,
      data.product_id,
      data.packaging_id || null,
      data.packet_count ?? null,
      data.quantity,
      data.quantity_unit || 'kg',
      data.rate,
      data.discount_value ?? 0,
      data.discount_type ?? 'per_kg',
      data.gst_percent ?? 0,
      data.amount,
      data.discount_amount,
      data.gst_amount,
      data.final_amount,
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
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;
    if (data.product_id !== undefined) {
      fields.push(`product_id = $${paramCount++}`);
      values.push(data.product_id);
    }
    if (data.packaging_id !== undefined) {
      fields.push(`packaging_id = $${paramCount++}`);
      values.push(data.packaging_id ?? null);
    }
    if (data.packet_count !== undefined) {
      fields.push(`packet_count = $${paramCount++}`);
      values.push(data.packet_count ?? null);
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
    if (data.discount_value !== undefined) {
      fields.push(`discount_value = $${paramCount++}`);
      values.push(data.discount_value);
    }
    if (data.discount_type !== undefined) {
      fields.push(`discount_type = $${paramCount++}`);
      values.push(data.discount_type);
    }
    if (data.gst_percent !== undefined) {
      fields.push(`gst_percent = $${paramCount++}`);
      values.push(data.gst_percent);
    }
    if (data.amount !== undefined) {
      fields.push(`amount = $${paramCount++}`);
      values.push(data.amount);
    }
    if (data.discount_amount !== undefined) {
      fields.push(`discount_amount = $${paramCount++}`);
      values.push(data.discount_amount);
    }
    if (data.gst_amount !== undefined) {
      fields.push(`gst_amount = $${paramCount++}`);
      values.push(data.gst_amount);
    }
    if (data.final_amount !== undefined) {
      fields.push(`final_amount = $${paramCount++}`);
      values.push(data.final_amount);
    }
    if (data.sort_order !== undefined) {
      fields.push(`sort_order = $${paramCount++}`);
      values.push(data.sort_order);
    }
    if (fields.length === 0) {
      return existing;
    }
    values.push(id);
    const query = `
      UPDATE sales_sauda_lines SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount}
      RETURNING id, sales_sauda_id, product_id, packaging_id, packet_count, quantity, quantity_unit, rate,
                discount_value, discount_type, gst_percent, amount, discount_amount, gst_amount, final_amount, sort_order, created_at, updated_at
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
