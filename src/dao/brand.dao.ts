import { db } from '../database/connection';
import { Brand, CreateBrandDTO, UpdateBrandDTO } from '../models/brand.model';
import { logger } from '../utils/logger';
import { buildNormalizedSearchClause } from '../utils/search';

const BRAND_SELECT = `
  id, name, code_prefix, status, created_at, updated_at, created_by, updated_by
`;

export class BrandDAO {
  async findAll(
    activeOnly = false,
    pagination?: { limit: number; offset: number },
    search?: string
  ): Promise<{ rows: Brand[]; total: number }> {
    let where = activeOnly ? `WHERE status = 'active'` : `WHERE 1=1`;
    const params: unknown[] = [];
    const searchClause = buildNormalizedSearchClause(['name', 'code_prefix', 'status'], search, 1);
    where += searchClause.sql;
    params.push(...searchClause.params);

    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM brands ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    let query = `
      SELECT ${BRAND_SELECT}
      FROM brands
      ${where}
      ORDER BY name ASC
    `;
    if (pagination) {
      params.push(pagination.limit, pagination.offset);
      query += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;
    }
    const result = await db.query<Brand>(query, params);
    return { rows: result.rows, total };
  }

  async findById(id: string): Promise<Brand | null> {
    const result = await db.query<Brand>(
      `SELECT ${BRAND_SELECT} FROM brands WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async findByName(name: string): Promise<Brand | null> {
    const result = await db.query<Brand>(
      `SELECT ${BRAND_SELECT} FROM brands WHERE LOWER(name) = LOWER($1)`,
      [name]
    );
    return result.rows[0] || null;
  }

  async create(data: CreateBrandDTO): Promise<Brand> {
    const result = await db.query<Brand>(
      `INSERT INTO brands (name, code_prefix, status, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING ${BRAND_SELECT}`,
      [data.name.trim(), data.code_prefix.trim().toUpperCase(), data.status ?? 'active', data.created_by ?? null]
    );
    await db.query(
      `INSERT INTO brand_product_sequences (brand_id, next_number)
       VALUES ($1, 1)
       ON CONFLICT (brand_id) DO NOTHING`,
      [result.rows[0].id]
    );
    logger.info('Brand created', { id: result.rows[0].id, name: result.rows[0].name });
    return result.rows[0];
  }

  async update(id: string, data: UpdateBrandDTO): Promise<Brand | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let n = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${n++}`);
      values.push(data.name.trim());
    }
    if (data.code_prefix !== undefined) {
      fields.push(`code_prefix = $${n++}`);
      values.push(data.code_prefix.trim().toUpperCase());
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
    const result = await db.query<Brand>(
      `UPDATE brands SET ${fields.join(', ')} WHERE id = $${n} RETURNING ${BRAND_SELECT}`,
      values
    );
    return result.rows[0] || null;
  }

  /**
   * Atomically allocate next product code for a brand: {PREFIX}-{NNN}
   */
  async allocateProductCode(brandId: string): Promise<string> {
    return db.transaction(async (client) => {
      const brandRes = await client.query<{ code_prefix: string }>(
        `SELECT code_prefix FROM brands WHERE id = $1 FOR UPDATE`,
        [brandId]
      );
      const brand = brandRes.rows[0];
      if (!brand) {
        throw new Error(`Brand not found: ${brandId}`);
      }

      await client.query(
        `INSERT INTO brand_product_sequences (brand_id, next_number)
         VALUES ($1, 1)
         ON CONFLICT (brand_id) DO NOTHING`,
        [brandId]
      );

      const seqRes = await client.query<{ next_number: number }>(
        `UPDATE brand_product_sequences
         SET next_number = next_number + 1
         WHERE brand_id = $1
         RETURNING next_number - 1 AS next_number`,
        [brandId]
      );
      const num = Number(seqRes.rows[0].next_number);
      return `${brand.code_prefix}-${String(num).padStart(3, '0')}`;
    });
  }
}

export const brandDAO = new BrandDAO();
