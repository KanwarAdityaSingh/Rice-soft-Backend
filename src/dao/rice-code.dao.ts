import { PoolClient } from 'pg';
import { db } from '../database/connection';
import {
  RiceCode,
  CreateRiceCodeDTO,
  UpdateRiceCodeDTO,
  RiceCodeVariant,
} from '../models/rice-code.model';
import type { RiceCategory } from '../constants/rice-categories';
import { logger } from '../utils/logger';

type VariantRow = {
  rice_code_id: string;
  rice_code_name: string;
  category: RiceCategory;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
  variant_id: string | null;
  variant: RiceCodeVariant['variant'] | null;
  variant_created_at: Date | null;
  variant_updated_at: Date | null;
};

function mapRowsToRiceCodes(rows: VariantRow[]): RiceCode[] {
  const codeMap = new Map<string, RiceCode>();

  for (const row of rows) {
    let code = codeMap.get(row.rice_code_id);
    if (!code) {
      code = {
        rice_code_id: row.rice_code_id,
        rice_code_name: row.rice_code_name,
        category: row.category,
        created_at: row.created_at,
        updated_at: row.updated_at,
        created_by: row.created_by,
        updated_by: row.updated_by,
        variants: [],
      };
      codeMap.set(row.rice_code_id, code);
    }

    if (row.variant_id && row.variant) {
      code.variants.push({
        id: row.variant_id,
        rice_code_id: row.rice_code_id,
        variant: row.variant,
        created_at: row.variant_created_at!,
        updated_at: row.variant_updated_at!,
      });
    }
  }

  return Array.from(codeMap.values());
}

export class RiceCodeDAO {
  private async fetchWithVariants(whereClause: string, params: unknown[] = []): Promise<RiceCode[]> {
    const query = `
      SELECT
        rc.rice_code_id,
        rc.rice_code_name,
        rc.category,
        rc.created_at,
        rc.updated_at,
        rc.created_by,
        rc.updated_by,
        rcv.id AS variant_id,
        rcv.variant,
        rcv.created_at AS variant_created_at,
        rcv.updated_at AS variant_updated_at
      FROM rice_codes rc
      LEFT JOIN rice_code_variants rcv ON rcv.rice_code_id = rc.rice_code_id
      ${whereClause}
      ORDER BY rc.rice_code_name ASC, rcv.variant ASC
    `;
    const result = await db.query<VariantRow>(query, params);
    return mapRowsToRiceCodes(result.rows);
  }

  async findAll(category?: RiceCategory): Promise<RiceCode[]> {
    if (category) {
      return this.fetchWithVariants('WHERE rc.category = $1', [category]);
    }
    return this.fetchWithVariants('');
  }

  async findById(riceCodeId: string): Promise<RiceCode | null> {
    const codes = await this.fetchWithVariants('WHERE rc.rice_code_id = $1', [riceCodeId]);
    return codes[0] || null;
  }

  async findByName(riceCodeName: string, category?: RiceCategory): Promise<RiceCode | null> {
    if (category) {
      const codes = await this.fetchWithVariants(
        'WHERE rc.rice_code_name = $1 AND rc.category = $2',
        [riceCodeName, category]
      );
      return codes[0] || null;
    }
    const codes = await this.fetchWithVariants('WHERE rc.rice_code_name = $1', [riceCodeName]);
    return codes[0] || null;
  }

  private async replaceVariants(
    client: PoolClient,
    riceCodeId: string,
    variants: RiceCodeVariant['variant'][]
  ): Promise<void> {
    await client.query('DELETE FROM rice_code_variants WHERE rice_code_id = $1', [riceCodeId]);
    for (const variant of variants) {
      await client.query(
        `INSERT INTO rice_code_variants (rice_code_id, variant) VALUES ($1, $2)`,
        [riceCodeId, variant]
      );
    }
  }

  async create(riceCodeData: CreateRiceCodeDTO): Promise<RiceCode> {
    const riceCodeId = await db.transaction(async (client) => {
      const insertResult = await client.query<{ rice_code_id: string }>(
        `
        INSERT INTO rice_codes (rice_code_name, category, created_by)
        VALUES ($1, $2, $3)
        RETURNING rice_code_id
      `,
        [riceCodeData.rice_code_name, riceCodeData.category, riceCodeData.created_by || null]
      );
      const id = insertResult.rows[0].rice_code_id;
      await this.replaceVariants(client, id, riceCodeData.variants);
      return id;
    });

    const created = await this.findById(riceCodeId);
    if (!created) {
      throw new Error('Rice code not found after create');
    }
    logger.info('Rice code created', {
      riceCodeId: created.rice_code_id,
      riceCodeName: created.rice_code_name,
      category: created.category,
    });
    return created;
  }

  async update(riceCodeId: string, riceCodeData: UpdateRiceCodeDTO): Promise<RiceCode | null> {
    await db.transaction(async (client) => {
      const fields: string[] = [];
      const values: unknown[] = [];
      let paramCount = 1;

      if (riceCodeData.rice_code_name !== undefined) {
        fields.push(`rice_code_name = $${paramCount++}`);
        values.push(riceCodeData.rice_code_name);
      }
      if (riceCodeData.category !== undefined) {
        fields.push(`category = $${paramCount++}`);
        values.push(riceCodeData.category);
      }
      if (riceCodeData.updated_by !== undefined) {
        fields.push(`updated_by = $${paramCount++}`);
        values.push(riceCodeData.updated_by);
      }

      if (fields.length > 0) {
        fields.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(riceCodeId);
        await client.query(
          `UPDATE rice_codes SET ${fields.join(', ')} WHERE rice_code_id = $${paramCount}`,
          values
        );
      }

      if (riceCodeData.variants !== undefined) {
        await this.replaceVariants(client, riceCodeId, riceCodeData.variants);
      }
    });

    return this.findById(riceCodeId);
  }

  async delete(riceCodeId: string): Promise<boolean> {
    const query = 'DELETE FROM rice_codes WHERE rice_code_id = $1';
    const result = await db.query(query, [riceCodeId]);
    return (result.rowCount || 0) > 0;
  }

  async nameExists(
    riceCodeName: string,
    category: RiceCategory,
    excludeId?: string
  ): Promise<boolean> {
    let query = 'SELECT 1 FROM rice_codes WHERE rice_code_name = $1 AND category = $2';
    const params: unknown[] = [riceCodeName, category];
    if (excludeId) {
      query += ' AND rice_code_id != $3';
      params.push(excludeId);
    }
    const result = await db.query(query, params);
    return result.rows.length > 0;
  }

  async hasVariant(riceCodeId: string, variant: string): Promise<boolean> {
    const result = await db.query(
      `SELECT 1 FROM rice_code_variants WHERE rice_code_id = $1 AND variant = $2::rice_type_enum`,
      [riceCodeId, variant]
    );
    return result.rows.length > 0;
  }
}

export const riceCodeDAO = new RiceCodeDAO();
