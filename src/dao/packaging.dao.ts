import { db } from '../database/connection';
import { Packaging, CreatePackagingDTO, UpdatePackagingDTO, PackagingWeight } from '../models/packaging.model';
import { logger } from '../utils/logger';

export class PackagingDAO {
  async findAll(productId?: string): Promise<Packaging[]> {
    let query = `
      SELECT id, packaging_number, product_id, holding_capacity, packet_type, packaging_vendor_id, ordered_weight, 
             created_at, updated_at, created_by, updated_by
      FROM packaging
    `;
    const params: any[] = [];
    
    if (productId) {
      query += ` WHERE product_id = $1`;
      params.push(productId);
    }
    
    query += ` ORDER BY holding_capacity ASC, packet_type ASC`;
    
    const result = await db.query<Packaging>(query, params);
    return result.rows;
  }

  async findById(id: string): Promise<Packaging | null> {
    const query = `
      SELECT id, packaging_number, product_id, holding_capacity, packet_type, packaging_vendor_id, ordered_weight,
             created_at, updated_at, created_by, updated_by
      FROM packaging
      WHERE id = $1
    `;
    const result = await db.query<Packaging>(query, [id]);
    return result.rows[0] || null;
  }

  async findByProductId(productId: string): Promise<Packaging[]> {
    const query = `
      SELECT id, packaging_number, product_id, holding_capacity, packet_type, packaging_vendor_id, ordered_weight,
             created_at, updated_at, created_by, updated_by
      FROM packaging
      WHERE product_id = $1
      ORDER BY packaging_number ASC, holding_capacity ASC
    `;
    const result = await db.query<Packaging>(query, [productId]);
    return result.rows;
  }

  async findByProductAndWeight(productId: string, weight: PackagingWeight): Promise<Packaging | null> {
    const query = `
      SELECT id, packaging_number, product_id, holding_capacity, packet_type, packaging_vendor_id, ordered_weight,
             created_at, updated_at, created_by, updated_by
      FROM packaging
      WHERE product_id = $1 AND holding_capacity = $2
      ORDER BY packaging_number ASC
      LIMIT 1
    `;
    const result = await db.query<Packaging>(query, [productId, weight]);
    return result.rows[0] || null;
  }

  async findByCapacityAndType(holdingCapacity: number, packetType: string): Promise<Packaging | null> {
    const query = `
      SELECT id, packaging_number, product_id, holding_capacity, packet_type, packaging_vendor_id, ordered_weight,
             created_at, updated_at, created_by, updated_by
      FROM packaging
      WHERE holding_capacity = $1 AND packet_type = $2
      ORDER BY packaging_number ASC
      LIMIT 1
    `;
    const result = await db.query<Packaging>(query, [holdingCapacity, packetType]);
    return result.rows[0] || null;
  }

  async create(packagingData: CreatePackagingDTO): Promise<Packaging> {
    const query = `
      INSERT INTO packaging (packaging_number, product_id, holding_capacity, packet_type, packaging_vendor_id, ordered_weight, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, packaging_number, product_id, holding_capacity, packet_type, packaging_vendor_id, ordered_weight,
                created_at, updated_at, created_by, updated_by
    `;
    
    const values = [
      (packagingData as any).packaging_number || null, // Optional - auto-generated if null
      packagingData.product_id,
      packagingData.holding_capacity,
      packagingData.packet_type,
      packagingData.packaging_vendor_id || null,
      packagingData.ordered_weight || null,
      packagingData.created_by || null
    ];
    
    try {
      const result = await db.query<Packaging>(query, values);
      logger.info('Packaging created', { id: result.rows[0].id, packaging_number: result.rows[0].packaging_number, product_id: result.rows[0].product_id });
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating packaging', { error, packagingData });
      throw error;
    }
  }

  async update(id: string, packagingData: UpdatePackagingDTO): Promise<Packaging | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (packagingData.holding_capacity !== undefined) {
      fields.push(`holding_capacity = $${paramCount++}`);
      values.push(packagingData.holding_capacity);
    }
    if (packagingData.packet_type !== undefined) {
      fields.push(`packet_type = $${paramCount++}`);
      values.push(packagingData.packet_type);
    }
    if (packagingData.packaging_vendor_id !== undefined) {
      fields.push(`packaging_vendor_id = $${paramCount++}`);
      values.push(packagingData.packaging_vendor_id || null);
    }
    if (packagingData.ordered_weight !== undefined) {
      fields.push(`ordered_weight = $${paramCount++}`);
      values.push(packagingData.ordered_weight || null);
    }
    if (packagingData.updated_by !== undefined) {
      fields.push(`updated_by = $${paramCount++}`);
      values.push(packagingData.updated_by);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE packaging
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, packaging_number, product_id, holding_capacity, packet_type, packaging_vendor_id, ordered_weight,
                created_at, updated_at, created_by, updated_by
    `;

    try {
      const result = await db.query<Packaging>(query, values);
      if (result.rows.length === 0) {
        return null;
      }
      logger.info('Packaging updated', { id });
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating packaging', { error, id });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM packaging WHERE id = $1';
    const result = await db.query(query, [id]);
    const deleted = (result.rowCount || 0) > 0;
    if (deleted) {
      logger.info('Packaging deleted', { id });
    }
    return deleted;
  }
}

export const packagingDAO = new PackagingDAO();

