import { db } from '../database/connection';
import { Packaging, CreatePackagingDTO, UpdatePackagingDTO } from '../models/packaging.model';
import { logger } from '../utils/logger';

export class PackagingDAO {
  async findAll(): Promise<Packaging[]> {
    const query = `
      SELECT id, holding_capacity, packet_type, source, created_at, updated_at, created_by, updated_by
      FROM packaging
      ORDER BY holding_capacity ASC, packet_type ASC
    `;
    const result = await db.query<Packaging>(query);
    return result.rows;
  }

  async findById(id: string): Promise<Packaging | null> {
    const query = `
      SELECT id, holding_capacity, packet_type, source, created_at, updated_at, created_by, updated_by
      FROM packaging
      WHERE id = $1
    `;
    const result = await db.query<Packaging>(query, [id]);
    return result.rows[0] || null;
  }

  async findByCapacityAndType(holdingCapacity: number, packetType: string): Promise<Packaging | null> {
    const query = `
      SELECT id, holding_capacity, packet_type, source, created_at, updated_at, created_by, updated_by
      FROM packaging
      WHERE holding_capacity = $1 AND packet_type = $2
    `;
    const result = await db.query<Packaging>(query, [holdingCapacity, packetType]);
    return result.rows[0] || null;
  }

  async create(packagingData: CreatePackagingDTO): Promise<Packaging> {
    const query = `
      INSERT INTO packaging (holding_capacity, packet_type, source, created_by)
      VALUES ($1, $2, $3, $4)
      RETURNING id, holding_capacity, packet_type, source, created_at, updated_at, created_by, updated_by
    `;
    
    const values = [
      packagingData.holding_capacity,
      packagingData.packet_type,
      packagingData.source || null,
      packagingData.created_by || null
    ];

    try {
      const result = await db.query<Packaging>(query, values);
      logger.info('Packaging created', { id: result.rows[0].id });
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
    if (packagingData.source !== undefined) {
      fields.push(`source = $${paramCount++}`);
      values.push(packagingData.source || null);
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
      RETURNING id, holding_capacity, packet_type, source, created_at, updated_at, created_by, updated_by
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

