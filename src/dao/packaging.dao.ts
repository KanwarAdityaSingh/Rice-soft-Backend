import { db } from '../database/connection';
import { Packaging, CreatePackagingDTO, UpdatePackagingDTO, PackagingWeight } from '../models/packaging.model';
import { logger } from '../utils/logger';
import { buildNormalizedSearchClause } from '../utils/search';

const PACKAGING_SELECT_COLUMNS = `
      p.id, p.packaging_number, p.product_id, p.holding_capacity,
      COALESCE(pm.name, p.packet_type) AS packet_type,
      p.packaging_material_id,
      pm.name AS packaging_material_name,
      p.remarks, p.status,
      p.packaging_vendor_id, p.ordered_weight,
      p.empty_bag_weight_kg, p.empty_bag_rate_per_kg, p.empty_bag_gst_percent,
      p.empty_bags_total_weight_kg, p.empty_bags_taxable_amount, p.empty_bags_gst_amount, p.empty_bags_total_amount,
      p.bill_number, p.bill_date, p.packaging_bill_url,
      p.created_at, p.updated_at, p.created_by, p.updated_by`;

const FROM_JOIN = `
  FROM packaging p
  LEFT JOIN packaging_materials pm ON pm.id = p.packaging_material_id
  LEFT JOIN products pr ON pr.id = p.product_id
`;

export type CreatePackagingRow = CreatePackagingDTO & {
  packet_type: string;
  packaging_number?: string | null;
};

export class PackagingDAO {
  async findAll(
    productId?: string,
    activeOnly = false,
    pagination?: { limit: number; offset: number },
    search?: string
  ): Promise<{ rows: Packaging[]; total: number }> {
    const params: unknown[] = [];
    const where: string[] = ['1=1'];
    if (productId) {
      params.push(productId);
      where.push(`p.product_id = $${params.length}`);
    }
    if (activeOnly) {
      where.push(`p.status = 'active'`);
    }
    let whereSql = `WHERE ${where.join(' AND ')}`;
    const searchClause = buildNormalizedSearchClause(
      [
        'p.packaging_number',
        'p.packet_type',
        'pm.name',
        'p.bill_number',
        'p.remarks',
        'pr.name',
        'p.holding_capacity',
      ],
      search,
      params.length + 1
    );
    whereSql += searchClause.sql;
    params.push(...searchClause.params);

    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count ${FROM_JOIN} ${whereSql}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    let query = `SELECT ${PACKAGING_SELECT_COLUMNS} ${FROM_JOIN} ${whereSql}
       ORDER BY p.holding_capacity ASC, packet_type ASC`;
    if (pagination) {
      params.push(pagination.limit, pagination.offset);
      query += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;
    }
    const result = await db.query<Packaging>(query, params);
    return { rows: result.rows, total };
  }

  async findById(id: string): Promise<Packaging | null> {
    const result = await db.query<Packaging>(
      `SELECT ${PACKAGING_SELECT_COLUMNS} ${FROM_JOIN} WHERE p.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async findByProductId(productId: string, activeOnly = false): Promise<Packaging[]> {
    const { rows } = await this.findAll(productId, activeOnly);
    return rows;
  }

  async findDistinctHoldingCapacities(productId: string): Promise<number[]> {
    const result = await db.query<{ holding_capacity: string }>(
      `SELECT DISTINCT holding_capacity
       FROM packaging
       WHERE product_id = $1 AND status = 'active'
       ORDER BY holding_capacity ASC`,
      [productId]
    );
    return result.rows.map((r) => Number(r.holding_capacity));
  }

  async findByProductCapacityMaterial(
    productId: string,
    holdingCapacity: number,
    materialId: string,
    excludeId?: string
  ): Promise<Packaging | null> {
    const params: unknown[] = [productId, holdingCapacity, materialId];
    let sql = `
      SELECT ${PACKAGING_SELECT_COLUMNS} ${FROM_JOIN}
      WHERE p.product_id = $1 AND p.holding_capacity = $2 AND p.packaging_material_id = $3
    `;
    if (excludeId) {
      params.push(excludeId);
      sql += ` AND p.id <> $4`;
    }
    sql += ` LIMIT 1`;
    const result = await db.query<Packaging>(sql, params);
    return result.rows[0] || null;
  }

  async findByProductAndWeight(productId: string, weight: PackagingWeight): Promise<Packaging | null> {
    const result = await db.query<Packaging>(
      `SELECT ${PACKAGING_SELECT_COLUMNS} ${FROM_JOIN}
       WHERE p.product_id = $1 AND p.holding_capacity = $2
       ORDER BY p.packaging_number ASC
       LIMIT 1`,
      [productId, weight]
    );
    return result.rows[0] || null;
  }

  async create(packagingData: CreatePackagingRow): Promise<Packaging> {
    const query = `
      INSERT INTO packaging (
        packaging_number, product_id, holding_capacity, packet_type,
        packaging_material_id, remarks, status, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `;
    const values = [
      packagingData.packaging_number || null,
      packagingData.product_id,
      packagingData.holding_capacity,
      packagingData.packet_type,
      packagingData.packaging_material_id,
      packagingData.remarks?.trim() || null,
      packagingData.status ?? 'active',
      packagingData.created_by || null,
    ];

    try {
      const inserted = await db.query<{ id: string }>(query, values);
      const row = await this.findById(inserted.rows[0].id);
      if (!row) throw new Error('Packaging created but not found');
      logger.info('Packaging created', {
        id: row.id,
        packaging_number: row.packaging_number,
        product_id: row.product_id,
      });
      return row;
    } catch (error) {
      logger.error('Error creating packaging', { error, packagingData });
      throw error;
    }
  }

  async update(id: string, packagingData: UpdatePackagingDTO & { packet_type?: string }): Promise<Packaging | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (packagingData.holding_capacity !== undefined) {
      fields.push(`holding_capacity = $${paramCount++}`);
      values.push(packagingData.holding_capacity);
    }
    if (packagingData.packaging_material_id !== undefined) {
      fields.push(`packaging_material_id = $${paramCount++}`);
      values.push(packagingData.packaging_material_id);
    }
    if (packagingData.packet_type !== undefined) {
      fields.push(`packet_type = $${paramCount++}`);
      values.push(packagingData.packet_type);
    }
    if (packagingData.remarks !== undefined) {
      fields.push(`remarks = $${paramCount++}`);
      values.push(packagingData.remarks?.trim() || null);
    }
    if (packagingData.status !== undefined) {
      fields.push(`status = $${paramCount++}`);
      values.push(packagingData.status);
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

    try {
      const result = await db.query<{ id: string }>(
        `UPDATE packaging SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING id`,
        values
      );
      if (result.rows.length === 0) return null;
      logger.info('Packaging updated', { id });
      return this.findById(id);
    } catch (error) {
      logger.error('Error updating packaging', { error, id });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.query('DELETE FROM packaging WHERE id = $1', [id]);
    const deleted = (result.rowCount || 0) > 0;
    if (deleted) logger.info('Packaging deleted', { id });
    return deleted;
  }
}

export const packagingDAO = new PackagingDAO();
