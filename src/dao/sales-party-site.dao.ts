import { db } from '../database/connection';
import {
  SalesPartySite,
  CreateSalesPartySiteDTO,
  UpdateSalesPartySiteDTO,
} from '../models/sales-party-site.model';
import { logger } from '../utils/logger';

const SELECT_COLUMNS = `
  id, sales_party_id, name, address, google_location_link, is_active,
  created_at, updated_at, created_by, updated_by
`;

export interface SalesPartySiteListOptions {
  includeInactive?: boolean;
  limit: number;
  offset: number;
}

export class SalesPartySiteDAO {
  async findBySalesPartyId(
    salesPartyId: string,
    options: SalesPartySiteListOptions
  ): Promise<{ rows: SalesPartySite[]; total: number }> {
    const { includeInactive = false, limit, offset } = options;

    let where = `WHERE sales_party_id = $1`;
    const params: unknown[] = [salesPartyId];
    let paramCount = 2;

    if (!includeInactive) {
      where += ` AND is_active = true`;
    }

    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM sales_party_sites ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const limitIdx = paramCount++;
    const offsetIdx = paramCount++;
    params.push(limit, offset);

    const result = await db.query<SalesPartySite>(
      `SELECT ${SELECT_COLUMNS}
       FROM sales_party_sites
       ${where}
       ORDER BY name NULLS LAST, created_at ASC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );
    return { rows: result.rows, total };
  }

  async findById(id: string): Promise<SalesPartySite | null> {
    const query = `
      SELECT ${SELECT_COLUMNS}
      FROM sales_party_sites
      WHERE id = $1
    `;
    const result = await db.query<SalesPartySite>(query, [id]);
    return result.rows[0] || null;
  }

  async create(data: CreateSalesPartySiteDTO): Promise<SalesPartySite> {
    const query = `
      INSERT INTO sales_party_sites (
        sales_party_id, name, address, google_location_link, is_active, created_by
      )
      VALUES ($1, $2, $3::jsonb, $4, $5, $6)
      RETURNING ${SELECT_COLUMNS}
    `;
    const values = [
      data.sales_party_id,
      data.name?.trim() || null,
      JSON.stringify(data.address),
      data.google_location_link?.trim() || null,
      data.is_active !== undefined ? data.is_active : true,
      data.created_by || null,
    ];
    const result = await db.query<SalesPartySite>(query, values);
    const row = result.rows[0];
    logger.info('Sales party site created', { id: row.id, sales_party_id: row.sales_party_id });
    return row;
  }

  async update(id: string, data: UpdateSalesPartySiteDTO): Promise<SalesPartySite | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${paramCount++}`);
      values.push(data.name?.trim() || null);
    }
    if (data.address !== undefined) {
      fields.push(`address = $${paramCount++}::jsonb`);
      values.push(JSON.stringify(data.address));
    }
    if (data.google_location_link !== undefined) {
      fields.push(`google_location_link = $${paramCount++}`);
      values.push(data.google_location_link?.trim() || null);
    }
    if (data.is_active !== undefined) {
      fields.push(`is_active = $${paramCount++}`);
      values.push(data.is_active);
    }
    if (data.updated_by !== undefined) {
      fields.push(`updated_by = $${paramCount++}`);
      values.push(data.updated_by);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE sales_party_sites
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING ${SELECT_COLUMNS}
    `;

    const result = await db.query<SalesPartySite>(query, values);
    const row = result.rows[0] || null;
    if (row) {
      logger.info('Sales party site updated', { id: row.id });
    }
    return row;
  }

  async delete(id: string): Promise<boolean> {
    const query = `DELETE FROM sales_party_sites WHERE id = $1`;
    const result = await db.query(query, [id]);
    const ok = (result.rowCount || 0) > 0;
    if (ok) {
      logger.info('Sales party site deleted', { id });
    }
    return ok;
  }
}

export const salesPartySiteDAO = new SalesPartySiteDAO();
