import { db } from '../database/connection';
import { RiceCode, CreateRiceCodeDTO, UpdateRiceCodeDTO } from '../models/rice-code.model';
import { logger } from '../utils/logger';

export class RiceCodeDAO {
  async findAll(): Promise<RiceCode[]> {
    const query = `
      SELECT rice_code_id, rice_code_name, created_at, updated_at, created_by, updated_by
      FROM rice_codes
      ORDER BY rice_code_name ASC
    `;
    const result = await db.query<RiceCode>(query);
    return result.rows;
  }

  async findById(riceCodeId: string): Promise<RiceCode | null> {
    const query = `
      SELECT rice_code_id, rice_code_name, created_at, updated_at, created_by, updated_by
      FROM rice_codes
      WHERE rice_code_id = $1
    `;
    const result = await db.query<RiceCode>(query, [riceCodeId]);
    return result.rows[0] || null;
  }

  async findByName(riceCodeName: string): Promise<RiceCode | null> {
    const query = `
      SELECT rice_code_id, rice_code_name, created_at, updated_at, created_by, updated_by
      FROM rice_codes
      WHERE rice_code_name = $1
    `;
    const result = await db.query<RiceCode>(query, [riceCodeName]);
    return result.rows[0] || null;
  }

  async create(riceCodeData: CreateRiceCodeDTO): Promise<RiceCode> {
    const query = `
      INSERT INTO rice_codes (rice_code_name, created_by)
      VALUES ($1, $2)
      RETURNING rice_code_id, rice_code_name, created_at, updated_at, created_by, updated_by
    `;
    
    const values = [
      riceCodeData.rice_code_name,
      riceCodeData.created_by || null
    ];

    const result = await db.query<RiceCode>(query, values);
    const riceCode = result.rows[0];

    logger.info('Rice code created', {
      riceCodeId: riceCode.rice_code_id,
      riceCodeName: riceCode.rice_code_name
    });

    return riceCode;
  }

  async update(riceCodeId: string, riceCodeData: UpdateRiceCodeDTO): Promise<RiceCode | null> {
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (riceCodeData.rice_code_name !== undefined) {
      fields.push(`rice_code_name = $${paramCount++}`);
      values.push(riceCodeData.rice_code_name);
    }
    if (riceCodeData.updated_by !== undefined) {
      fields.push(`updated_by = $${paramCount++}`);
      values.push(riceCodeData.updated_by);
    }

    if (fields.length === 0) {
      return this.findById(riceCodeId);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(riceCodeId);

    const query = `
      UPDATE rice_codes
      SET ${fields.join(', ')}
      WHERE rice_code_id = $${paramCount}
      RETURNING rice_code_id, rice_code_name, created_at, updated_at, created_by, updated_by
    `;

    const result = await db.query<RiceCode>(query, values);
    return result.rows[0] || null;
  }

  async delete(riceCodeId: string): Promise<boolean> {
    const query = 'DELETE FROM rice_codes WHERE rice_code_id = $1';
    const result = await db.query(query, [riceCodeId]);
    return (result.rowCount || 0) > 0;
  }

  async nameExists(riceCodeName: string, excludeId?: string): Promise<boolean> {
    let query = 'SELECT 1 FROM rice_codes WHERE rice_code_name = $1';
    const params = [riceCodeName];
    
    if (excludeId) {
      query += ' AND rice_code_id != $2';
      params.push(excludeId);
    }
    
    const result = await db.query(query, params);
    return result.rows.length > 0;
  }
}

export const riceCodeDAO = new RiceCodeDAO();

