import { db } from '../database/connection';
import {
  RiceLength,
  CreateRiceLengthDTO,
  UpdateRiceLengthDTO,
} from '../models/rice-length.model';
import { logger } from '../utils/logger';

const SELECT_COLUMNS = `
  rice_length_id, name, is_active,
  created_at, updated_at, created_by, updated_by
`;

export class RiceLengthDAO {
  async findAll(includeInactive = false): Promise<RiceLength[]> {
    let query = `
      SELECT ${SELECT_COLUMNS}
      FROM rice_lengths
      WHERE 1=1
    `;
    if (!includeInactive) {
      query += ` AND is_active = true`;
    }
    query += ` ORDER BY name ASC`;
    const result = await db.query<RiceLength>(query);
    return result.rows;
  }

  async findById(riceLengthId: string): Promise<RiceLength | null> {
    const query = `
      SELECT ${SELECT_COLUMNS}
      FROM rice_lengths
      WHERE rice_length_id = $1
    `;
    const result = await db.query<RiceLength>(query, [riceLengthId]);
    return result.rows[0] || null;
  }

  async create(data: CreateRiceLengthDTO): Promise<RiceLength> {
    const query = `
      INSERT INTO rice_lengths (name, is_active, created_by)
      VALUES ($1, $2, $3)
      RETURNING ${SELECT_COLUMNS}
    `;
    const values = [
      data.name.trim(),
      data.is_active !== undefined ? data.is_active : true,
      data.created_by || null,
    ];
    const result = await db.query<RiceLength>(query, values);
    const row = result.rows[0];
    logger.info('Rice length created', { riceLengthId: row.rice_length_id, name: row.name });
    return row;
  }

  async update(riceLengthId: string, data: UpdateRiceLengthDTO): Promise<RiceLength | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${paramCount++}`);
      values.push(data.name.trim());
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
      return this.findById(riceLengthId);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(riceLengthId);

    const query = `
      UPDATE rice_lengths
      SET ${fields.join(', ')}
      WHERE rice_length_id = $${paramCount}
      RETURNING ${SELECT_COLUMNS}
    `;
    const result = await db.query<RiceLength>(query, values);
    return result.rows[0] || null;
  }

  async delete(riceLengthId: string): Promise<boolean> {
    const query = `DELETE FROM rice_lengths WHERE rice_length_id = $1`;
    const result = await db.query(query, [riceLengthId]);
    return (result.rowCount || 0) > 0;
  }

  async countSaudaReferences(riceLengthId: string): Promise<number> {
    const result = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM saudas WHERE rice_length_id = $1`,
      [riceLengthId]
    );
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }
}

export const riceLengthDAO = new RiceLengthDAO();
