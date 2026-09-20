import { db } from '../database/connection';
import {
  SaudaWeightVarianceRecord,
  CreateSaudaWeightVarianceRecordDTO,
} from '../models/sauda-weight-variance.model';
import { formatSaudaDisplayId } from '../utils/sauda-display';
import { buildNormalizedSearchClause } from '../utils/search';
import { logger } from '../utils/logger';

const SELECT = `
  r.id, r.sauda_id, r.payment_advice_id, r.inward_slip_pass_id, r.broker_id, r.purchaser_id,
  r.bill_weight, r.kanta_weight, r.variance_kg, r.direction, r.created_at, r.created_by,
  b.business_name AS broker_name,
  v.business_name AS purchaser_name,
  pa.sr_number AS payment_advice_sr_number
`;

const FROM = `
  FROM sauda_weight_variance_records r
  LEFT JOIN brokers b ON b.id = r.broker_id
  LEFT JOIN vendors v ON v.id = r.purchaser_id
  LEFT JOIN payment_advices pa ON pa.id = r.payment_advice_id
`;

function transform(row: SaudaWeightVarianceRecord): SaudaWeightVarianceRecord {
  return {
    ...row,
    bill_weight: Number(row.bill_weight),
    kanta_weight: Number(row.kanta_weight),
    variance_kg: Number(row.variance_kg),
    sauda_display_id: formatSaudaDisplayId(row.sauda_id),
  };
}

export interface SaudaWeightVarianceFilters {
  saudaId?: string;
  paymentAdviceId?: string;
  brokerId?: string;
  purchaserId?: string;
  direction?: 'short' | 'excess';
}

export class SaudaWeightVarianceDAO {
  async create(data: CreateSaudaWeightVarianceRecordDTO): Promise<SaudaWeightVarianceRecord> {
    const sql = `
      INSERT INTO sauda_weight_variance_records (
        sauda_id, payment_advice_id, inward_slip_pass_id, broker_id, purchaser_id,
        bill_weight, kanta_weight, variance_kg, direction, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `;
    const values = [
      data.sauda_id,
      data.payment_advice_id,
      data.inward_slip_pass_id ?? null,
      data.broker_id ?? null,
      data.purchaser_id ?? null,
      data.bill_weight,
      data.kanta_weight,
      data.variance_kg,
      data.direction,
      data.created_by ?? null,
    ];
    const inserted = await db.query<{ id: string }>(sql, values);
    const created = await this.findById(inserted.rows[0].id);
    if (!created) throw new Error('Failed to load weight variance record after create');
    logger.info('Sauda weight variance recorded', {
      id: created.id,
      saudaId: created.sauda_id,
      paymentAdviceId: created.payment_advice_id,
      direction: created.direction,
      varianceKg: created.variance_kg,
    });
    return created;
  }

  async findById(id: string): Promise<SaudaWeightVarianceRecord | null> {
    const result = await db.query<SaudaWeightVarianceRecord>(
      `SELECT ${SELECT} ${FROM} WHERE r.id = $1`,
      [id]
    );
    return result.rows[0] ? transform(result.rows[0]) : null;
  }

  /** Most recent record for a sauda+payment-advice pair — used to dedupe consecutive identical values. */
  async findLatestBySaudaAndPaymentAdvice(
    saudaId: string,
    paymentAdviceId: string
  ): Promise<SaudaWeightVarianceRecord | null> {
    const result = await db.query<SaudaWeightVarianceRecord>(
      `SELECT ${SELECT} ${FROM}
       WHERE r.sauda_id = $1 AND r.payment_advice_id = $2
       ORDER BY r.created_at DESC
       LIMIT 1`,
      [saudaId, paymentAdviceId]
    );
    return result.rows[0] ? transform(result.rows[0]) : null;
  }

  /** Latest variance per payment advice id — used to attach the note when reading saved payment advices. */
  async findLatestByPaymentAdviceIds(
    paymentAdviceIds: string[]
  ): Promise<Map<string, SaudaWeightVarianceRecord>> {
    if (paymentAdviceIds.length === 0) {
      return new Map();
    }
    const result = await db.query<SaudaWeightVarianceRecord>(
      `SELECT DISTINCT ON (r.payment_advice_id) ${SELECT}
       ${FROM}
       WHERE r.payment_advice_id = ANY($1::uuid[])
       ORDER BY r.payment_advice_id, r.created_at DESC`,
      [paymentAdviceIds]
    );
    const map = new Map<string, SaudaWeightVarianceRecord>();
    for (const row of result.rows) {
      map.set(row.payment_advice_id, transform(row));
    }
    return map;
  }

  async findAll(
    filters?: SaudaWeightVarianceFilters,
    pagination?: { limit: number; offset: number },
    search?: string
  ): Promise<{ rows: SaudaWeightVarianceRecord[]; total: number }> {
    let where = ' WHERE 1=1';
    const params: unknown[] = [];
    let paramCount = 1;

    if (filters?.saudaId) {
      where += ` AND r.sauda_id = $${paramCount++}`;
      params.push(filters.saudaId);
    }
    if (filters?.paymentAdviceId) {
      where += ` AND r.payment_advice_id = $${paramCount++}`;
      params.push(filters.paymentAdviceId);
    }
    if (filters?.brokerId) {
      where += ` AND r.broker_id = $${paramCount++}`;
      params.push(filters.brokerId);
    }
    if (filters?.purchaserId) {
      where += ` AND r.purchaser_id = $${paramCount++}`;
      params.push(filters.purchaserId);
    }
    if (filters?.direction) {
      where += ` AND r.direction = $${paramCount++}`;
      params.push(filters.direction);
    }

    const searchClause = buildNormalizedSearchClause(
      ['b.business_name', 'v.business_name', 'pa.sr_number', 'r.direction'],
      search,
      paramCount
    );
    where += searchClause.sql;
    params.push(...searchClause.params);
    paramCount = searchClause.nextParamIndex;

    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count ${FROM}${where}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const limit = pagination?.limit ?? 50;
    const offset = pagination?.offset ?? 0;
    const result = await db.query<SaudaWeightVarianceRecord>(
      `SELECT ${SELECT}
       ${FROM}
       ${where}
       ORDER BY r.created_at DESC
       LIMIT $${paramCount++} OFFSET $${paramCount}`,
      [...params, limit, offset]
    );

    return { rows: result.rows.map(transform), total };
  }
}

export const saudaWeightVarianceDAO = new SaudaWeightVarianceDAO();
