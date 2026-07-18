import { PoolClient } from 'pg';
import { db } from '../database/connection';
import { CreateParameterDTO, Parameter, UpdateParameterDTO } from '../models/parameter.model';
import { logger } from '../utils/logger';
import {
  normalizeSaudaParametersInput,
  saudaParametersHasAnyValue,
} from '../utils/sauda-parameters';
import type { SaudaParametersInput } from '../constants/sauda-parameters';

const PARAMETER_COLUMNS = `
  id, sauda_id, inward_slip_pass_id, product_id, batch_id,
  purity, natural_admixture, average_grain_length, moisture, broken_grain,
  damage_discolour_grain, immature_grains, whiteness, foreign_matter, black_grains,
  created_at, updated_at, created_by, updated_by
`;

export class ParameterDAO {
  async create(data: CreateParameterDTO, client?: PoolClient): Promise<Parameter> {
    const query = `
      INSERT INTO parameters (
        sauda_id, inward_slip_pass_id, product_id, batch_id,
        purity, natural_admixture, average_grain_length, moisture, broken_grain,
        damage_discolour_grain, immature_grains, whiteness, foreign_matter, black_grains,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING ${PARAMETER_COLUMNS}
    `;
    const values = [
      data.sauda_id ?? null,
      data.inward_slip_pass_id ?? null,
      data.product_id ?? null,
      data.batch_id ?? null,
      data.purity ?? null,
      data.natural_admixture ?? null,
      data.average_grain_length ?? null,
      data.moisture ?? null,
      data.broken_grain ?? null,
      data.damage_discolour_grain ?? null,
      data.immature_grains ?? null,
      data.whiteness ?? null,
      data.foreign_matter ?? null,
      data.black_grains ?? null,
      data.created_by ?? null,
    ];
    try {
      const result = client
        ? await client.query<Parameter>(query, values)
        : await db.query<Parameter>(query, values);
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating parameter row', { error, data });
      throw error;
    }
  }

  async findById(id: string, client?: PoolClient): Promise<Parameter | null> {
    const query = `
      SELECT ${PARAMETER_COLUMNS}
      FROM parameters
      WHERE id = $1
    `;
    const result = client
      ? await client.query<Parameter>(query, [id])
      : await db.query<Parameter>(query, [id]);
    return result.rows[0] || null;
  }

  async findBySaudaId(saudaId: string, client?: PoolClient): Promise<Parameter | null> {
    const query = `
      SELECT ${PARAMETER_COLUMNS}
      FROM parameters
      WHERE sauda_id = $1
    `;
    const result = client
      ? await client.query<Parameter>(query, [saudaId])
      : await db.query<Parameter>(query, [saudaId]);
    return result.rows[0] || null;
  }

  async findBySaudaIds(saudaIds: string[]): Promise<Parameter[]> {
    if (saudaIds.length === 0) {
      return [];
    }
    const query = `
      SELECT ${PARAMETER_COLUMNS}
      FROM parameters
      WHERE sauda_id = ANY($1::uuid[])
    `;
    const result = await db.query<Parameter>(query, [saudaIds]);
    return result.rows;
  }

  async findAll(filters: {
    sauda_id?: string;
    batch_id?: string;
    product_id?: string;
    inward_slip_pass_id?: string;
  }): Promise<Parameter[]> {
    let query = `
      SELECT ${PARAMETER_COLUMNS}
      FROM parameters
      WHERE 1=1
    `;
    const params: unknown[] = [];
    let n = 1;
    if (filters.sauda_id) {
      query += ` AND sauda_id = $${n++}`;
      params.push(filters.sauda_id);
    }
    if (filters.batch_id) {
      query += ` AND batch_id = $${n++}`;
      params.push(filters.batch_id);
    }
    if (filters.product_id) {
      query += ` AND product_id = $${n++}`;
      params.push(filters.product_id);
    }
    if (filters.inward_slip_pass_id) {
      query += ` AND inward_slip_pass_id = $${n++}`;
      params.push(filters.inward_slip_pass_id);
    }
    query += ` ORDER BY created_at DESC`;
    const result = await db.query<Parameter>(query, params);
    return result.rows;
  }

  async upsertForSauda(
    saudaId: string,
    input: SaudaParametersInput,
    userId?: string | null,
    client?: PoolClient
  ): Promise<Parameter | null> {
    const values = normalizeSaudaParametersInput(input);
    const existing = await this.findBySaudaId(saudaId, client);

    if (!saudaParametersHasAnyValue(values)) {
      if (existing) {
        await this.delete(existing.id, client);
      }
      return null;
    }

    if (existing) {
      const updated = await this.update(
        existing.id,
        {
          ...values,
          updated_by: userId ?? undefined,
        },
        client
      );
      return updated;
    }

    return this.create(
      {
        sauda_id: saudaId,
        ...values,
        created_by: userId ?? undefined,
      },
      client
    );
  }

  async update(id: string, data: UpdateParameterDTO, client?: PoolClient): Promise<Parameter | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    const push = (column: string, value: unknown) => {
      fields.push(`${column} = $${paramCount++}`);
      values.push(value);
    };

    if (data.sauda_id !== undefined) push('sauda_id', data.sauda_id);
    if (data.inward_slip_pass_id !== undefined) push('inward_slip_pass_id', data.inward_slip_pass_id);
    if (data.product_id !== undefined) push('product_id', data.product_id);
    if (data.batch_id !== undefined) push('batch_id', data.batch_id);
    if (data.purity !== undefined) push('purity', data.purity);
    if (data.natural_admixture !== undefined) push('natural_admixture', data.natural_admixture);
    if (data.average_grain_length !== undefined) push('average_grain_length', data.average_grain_length);
    if (data.moisture !== undefined) push('moisture', data.moisture);
    if (data.broken_grain !== undefined) push('broken_grain', data.broken_grain);
    if (data.damage_discolour_grain !== undefined) push('damage_discolour_grain', data.damage_discolour_grain);
    if (data.immature_grains !== undefined) push('immature_grains', data.immature_grains);
    if (data.whiteness !== undefined) push('whiteness', data.whiteness);
    if (data.foreign_matter !== undefined) push('foreign_matter', data.foreign_matter);
    if (data.black_grains !== undefined) push('black_grains', data.black_grains);
    if (data.updated_by !== undefined) push('updated_by', data.updated_by);

    if (fields.length === 0) {
      return this.findById(id, client);
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const query = `
      UPDATE parameters
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING ${PARAMETER_COLUMNS}
    `;

    try {
      const result = client
        ? await client.query<Parameter>(query, values)
        : await db.query<Parameter>(query, values);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error updating parameter row', { error, id, data });
      throw error;
    }
  }

  async delete(id: string, client?: PoolClient): Promise<boolean> {
    const query = 'DELETE FROM parameters WHERE id = $1';
    const result = client ? await client.query(query, [id]) : await db.query(query, [id]);
    return (result.rowCount || 0) > 0;
  }
}

export const parameterDAO = new ParameterDAO();
