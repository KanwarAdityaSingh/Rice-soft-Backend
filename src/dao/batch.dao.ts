import { db } from '../database/connection';
import { Batch, CreateBatchDTO, UpdateBatchDTO, BatchLotUsage, BatchRiceCodeUsage, BatchProduct, BatchPackaging, CreateBatchProductDTO, CreateBatchPackagingDTO } from '../models/batch.model';
import { logger } from '../utils/logger';

export class BatchDAO {
  async findAll(productId?: string, status?: string): Promise<Batch[]> {
    let query = `
      SELECT id, batch_number, product_id, recipe_id, packaging_id, quantity, status,
             created_at, updated_at, created_by, updated_by
      FROM batches
      WHERE 1=1
    `;
    
    const params: any[] = [];
    let paramCount = 1;

    if (productId) {
      query += ` AND product_id = $${paramCount++}`;
      params.push(productId);
    }
    if (status) {
      query += ` AND status = $${paramCount++}`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC`;

    const result = await db.query<Batch>(query, params);
    return result.rows;
  }

  async findById(id: string): Promise<Batch | null> {
    const query = `
      SELECT id, batch_number, product_id, recipe_id, packaging_id, quantity, status,
             created_at, updated_at, created_by, updated_by
      FROM batches
      WHERE id = $1
    `;
    const result = await db.query<Batch>(query, [id]);
    return result.rows[0] || null;
  }

  async create(batchData: CreateBatchDTO): Promise<Batch> {
    const query = `
      INSERT INTO batches (batch_number, product_id, recipe_id, packaging_id, quantity, status, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, batch_number, product_id, recipe_id, packaging_id, quantity, status,
                created_at, updated_at, created_by, updated_by
    `;
    
    const values = [
      batchData.batch_number || null,
      null, // product_id - nullable for three-stage workflow
      batchData.recipe_id,
      null, // packaging_id - nullable for three-stage workflow
      batchData.quantity,
      batchData.status || 'recipe_attached',
      batchData.created_by || null
    ];

    try {
      const result = await db.query<Batch>(query, values);
      logger.info('Batch created', { id: result.rows[0].id, batch_number: result.rows[0].batch_number });
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating batch', { error, batchData });
      throw error;
    }
  }

  async update(id: string, batchData: UpdateBatchDTO): Promise<Batch | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (batchData.status !== undefined) {
      fields.push(`status = $${paramCount++}`);
      values.push(batchData.status);
    }
    if (batchData.quantity !== undefined) {
      fields.push(`quantity = $${paramCount++}`);
      values.push(batchData.quantity);
    }
    if (batchData.updated_by !== undefined) {
      fields.push(`updated_by = $${paramCount++}`);
      values.push(batchData.updated_by);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE batches
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, batch_number, product_id, recipe_id, packaging_id, quantity, status,
                created_at, updated_at, created_by, updated_by
    `;

    try {
      const result = await db.query<Batch>(query, values);
      if (result.rows.length === 0) {
        return null;
      }
      logger.info('Batch updated', { id });
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating batch', { error, id });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM batches WHERE id = $1';
    const result = await db.query(query, [id]);
    const deleted = (result.rowCount || 0) > 0;
    if (deleted) {
      logger.info('Batch deleted', { id });
    }
    return deleted;
  }

  async createLotUsage(batchId: string, lotId: string, quantityUsed: number, percentageUsed: number, createdBy?: string): Promise<BatchLotUsage> {
    const query = `
      INSERT INTO batch_lot_usage (batch_id, lot_id, quantity_used, percentage_used, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, batch_id, lot_id, quantity_used, percentage_used, created_at, updated_at
    `;
    const result = await db.query<BatchLotUsage>(query, [batchId, lotId, quantityUsed, percentageUsed, createdBy || null]);
    return result.rows[0];
  }

  async getLotUsage(batchId: string): Promise<BatchLotUsage[]> {
    const query = `
      SELECT id, batch_id, lot_id, quantity_used, percentage_used, created_at, updated_at
      FROM batch_lot_usage
      WHERE batch_id = $1
      ORDER BY lot_id ASC
    `;
    const result = await db.query<BatchLotUsage>(query, [batchId]);
    return result.rows;
  }

  async createRiceCodeUsage(batchId: string, riceCodeId: string, riceType: string | null, totalQuantityUsed: number, createdBy?: string): Promise<BatchRiceCodeUsage> {
    const query = `
      INSERT INTO batch_rice_code_usage (batch_id, rice_code_id, rice_type, total_quantity_used, created_by)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (batch_id, rice_code_id) 
      DO UPDATE SET total_quantity_used = EXCLUDED.total_quantity_used, updated_at = CURRENT_TIMESTAMP
      RETURNING id, batch_id, rice_code_id, rice_type, total_quantity_used, created_at, updated_at
    `;
    const result = await db.query<BatchRiceCodeUsage>(query, [batchId, riceCodeId, riceType, totalQuantityUsed, createdBy || null]);
    return result.rows[0];
  }

  async getRiceCodeUsage(batchId: string): Promise<BatchRiceCodeUsage[]> {
    const query = `
      SELECT id, batch_id, rice_code_id, rice_type, total_quantity_used, created_at, updated_at
      FROM batch_rice_code_usage
      WHERE batch_id = $1
      ORDER BY rice_code_id ASC
    `;
    const result = await db.query<BatchRiceCodeUsage>(query, [batchId]);
    return result.rows;
  }

  // Batch Products methods (Stage 2)
  async addProduct(batchId: string, productData: CreateBatchProductDTO): Promise<BatchProduct> {
    const query = `
      INSERT INTO batch_products (batch_id, product_id, created_by)
      VALUES ($1, $2, $3)
      ON CONFLICT (batch_id, product_id) DO NOTHING
      RETURNING id, batch_id, product_id, created_at, updated_at, created_by, updated_by
    `;
    const result = await db.query<BatchProduct>(query, [batchId, productData.product_id, productData.created_by || null]);
    
    if (result.rows.length === 0) {
      // Already exists, fetch it
      const existing = await this.getProduct(batchId, productData.product_id);
      if (!existing) {
        throw new Error('Product should exist but was not found');
      }
      return existing;
    }
    
    return result.rows[0];
  }

  async removeProduct(batchId: string, productId: string): Promise<boolean> {
    const query = 'DELETE FROM batch_products WHERE batch_id = $1 AND product_id = $2';
    const result = await db.query(query, [batchId, productId]);
    return (result.rowCount || 0) > 0;
  }

  async getProducts(batchId: string): Promise<BatchProduct[]> {
    const query = `
      SELECT id, batch_id, product_id, created_at, updated_at, created_by, updated_by
      FROM batch_products
      WHERE batch_id = $1
      ORDER BY created_at ASC
    `;
    const result = await db.query<BatchProduct>(query, [batchId]);
    return result.rows;
  }

  async getProduct(batchId: string, productId: string): Promise<BatchProduct | null> {
    const query = `
      SELECT id, batch_id, product_id, created_at, updated_at, created_by, updated_by
      FROM batch_products
      WHERE batch_id = $1 AND product_id = $2
    `;
    const result = await db.query<BatchProduct>(query, [batchId, productId]);
    return result.rows[0] || null;
  }

  // Batch Packaging methods (Stage 3)
  async addPackaging(batchId: string, packagingData: CreateBatchPackagingDTO): Promise<BatchPackaging> {
    const query = `
      INSERT INTO batch_packaging (batch_id, product_id, packaging_id, quantity, created_by)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (batch_id, packaging_id) 
      DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = CURRENT_TIMESTAMP
      RETURNING id, batch_id, product_id, packaging_id, quantity, created_at, updated_at, created_by, updated_by
    `;
    const result = await db.query<BatchPackaging>(query, [
      batchId,
      packagingData.product_id,
      packagingData.packaging_id,
      packagingData.quantity,
      packagingData.created_by || null
    ]);
    return result.rows[0];
  }

  async removePackaging(batchId: string, packagingId: string): Promise<boolean> {
    const query = 'DELETE FROM batch_packaging WHERE batch_id = $1 AND packaging_id = $2';
    const result = await db.query(query, [batchId, packagingId]);
    return (result.rowCount || 0) > 0;
  }

  async getPackaging(batchId: string): Promise<BatchPackaging[]> {
    const query = `
      SELECT id, batch_id, product_id, packaging_id, quantity, created_at, updated_at, created_by, updated_by
      FROM batch_packaging
      WHERE batch_id = $1
      ORDER BY created_at ASC
    `;
    const result = await db.query<BatchPackaging>(query, [batchId]);
    return result.rows;
  }

  async getPackagingByProduct(batchId: string, productId: string): Promise<BatchPackaging[]> {
    const query = `
      SELECT id, batch_id, product_id, packaging_id, quantity, created_at, updated_at, created_by, updated_by
      FROM batch_packaging
      WHERE batch_id = $1 AND product_id = $2
      ORDER BY created_at ASC
    `;
    const result = await db.query<BatchPackaging>(query, [batchId, productId]);
    return result.rows;
  }
}

export const batchDAO = new BatchDAO();

