import { db } from '../database/connection';
import {
  PackagingMaterial,
  CreatePackagingMaterialDTO,
  UpdatePackagingMaterialDTO,
} from '../models/packaging-material.model';
import { logger } from '../utils/logger';
import { buildNormalizedSearchClause } from '../utils/search';

const SELECT = `
  id, name, status, created_at, updated_at, created_by, updated_by
`;

export class PackagingMaterialDAO {
  async findAll(
    activeOnly = false,
    pagination?: { limit: number; offset: number },
    search?: string
  ): Promise<{ rows: PackagingMaterial[]; total: number }> {
    let where = activeOnly ? `WHERE status = 'active'` : `WHERE 1=1`;
    const params: unknown[] = [];
    const searchClause = buildNormalizedSearchClause(['name'], search, 1);
    where += searchClause.sql;
    params.push(...searchClause.params);

    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM packaging_materials ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    let query = `
      SELECT ${SELECT}
      FROM packaging_materials
      ${where}
      ORDER BY name ASC
    `;
    if (pagination) {
      params.push(pagination.limit, pagination.offset);
      query += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;
    }
    const result = await db.query<PackagingMaterial>(query, params);
    return { rows: result.rows, total };
  }

  async findById(id: string): Promise<PackagingMaterial | null> {
    const result = await db.query<PackagingMaterial>(
      `SELECT ${SELECT} FROM packaging_materials WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async create(data: CreatePackagingMaterialDTO): Promise<PackagingMaterial> {
    const result = await db.query<PackagingMaterial>(
      `INSERT INTO packaging_materials (name, status, created_by)
       VALUES ($1, $2, $3)
       RETURNING ${SELECT}`,
      [data.name.trim(), data.status ?? 'active', data.created_by ?? null]
    );
    logger.info('Packaging material created', { id: result.rows[0].id });
    return result.rows[0];
  }

  async update(id: string, data: UpdatePackagingMaterialDTO): Promise<PackagingMaterial | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let n = 1;
    if (data.name !== undefined) {
      fields.push(`name = $${n++}`);
      values.push(data.name.trim());
    }
    if (data.status !== undefined) {
      fields.push(`status = $${n++}`);
      values.push(data.status);
    }
    if (data.updated_by !== undefined) {
      fields.push(`updated_by = $${n++}`);
      values.push(data.updated_by);
    }
    if (fields.length === 0) return this.findById(id);
    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);
    const result = await db.query<PackagingMaterial>(
      `UPDATE packaging_materials SET ${fields.join(', ')} WHERE id = $${n} RETURNING ${SELECT}`,
      values
    );
    return result.rows[0] || null;
  }
}

export const packagingMaterialDAO = new PackagingMaterialDAO();
