import { PoolClient } from 'pg';
import { db } from '../database/connection';
import {
  CouponBatch,
  CouponBatchListFilters,
  CreateCouponBatchDTO,
  CouponBatchStats,
} from '../models/coupon.model';
import type { CouponBatchStatus } from '../constants/coupon-status';
import { COUPON_BATCH_MAX_SERIES_PER_DAY } from '../constants/coupon-status';
import {
  formatCouponBatchCode,
  getIndiaCalendarParts,
} from '../utils/coupon.helpers';
import { BadRequestError } from '../utils/errors';
import { buildNormalizedSearchClause } from '../utils/search';

export class CouponBatchDAO {
  /**
   * Allocate next day-series (IST) and return the formatted batch_code.
   * Counter never decreases — deleting a batch does not free its series.
   */
  async allocateBatchCode(client: PoolClient, at: Date = new Date()): Promise<string> {
    const parts = getIndiaCalendarParts(at);
    const result = await client.query<{ last_series: number }>(
      `
      INSERT INTO coupon_batch_day_series (series_date, last_series)
      VALUES ($1::date, 1)
      ON CONFLICT (series_date) DO UPDATE
        SET last_series = coupon_batch_day_series.last_series + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE coupon_batch_day_series.last_series < $2
      RETURNING last_series
      `,
      [parts.seriesDate, COUPON_BATCH_MAX_SERIES_PER_DAY]
    );

    const series = result.rows[0]?.last_series;
    if (series == null) {
      throw new BadRequestError(
        `Daily coupon batch series limit (${COUPON_BATCH_MAX_SERIES_PER_DAY}) reached for ${parts.seriesDate}`
      );
    }

    return formatCouponBatchCode(parts, series);
  }

  async create(data: CreateCouponBatchDTO & { batch_code: string }, client?: PoolClient): Promise<CouponBatch> {
    const query = `
      INSERT INTO coupon_batches (
        batch_code, description, face_value_paise, total_count, expires_at,
        redeem_base_url, created_by, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft')
      RETURNING *
    `;
    const values = [
      data.batch_code,
      data.description ?? null,
      data.face_value_paise,
      data.total_count,
      data.expires_at,
      data.redeem_base_url ?? null,
      data.created_by ?? null,
    ];
    const result = client
      ? await client.query<CouponBatch>(query, values)
      : await db.query<CouponBatch>(query, values);
    return result.rows[0];
  }

  async findById(id: string, client?: PoolClient): Promise<CouponBatch | null> {
    const query = `SELECT * FROM coupon_batches WHERE coupon_batch_id = $1`;
    const result = client
      ? await client.query<CouponBatch>(query, [id])
      : await db.query<CouponBatch>(query, [id]);
    return result.rows[0] || null;
  }

  async findByIdForUpdate(id: string, client: PoolClient): Promise<CouponBatch | null> {
    const result = await client.query<CouponBatch>(
      `SELECT * FROM coupon_batches WHERE coupon_batch_id = $1 FOR UPDATE`,
      [id]
    );
    return result.rows[0] || null;
  }

  async findAll(
    filters: CouponBatchListFilters = {}
  ): Promise<{ rows: CouponBatch[]; total: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;
    const offset = (page - 1) * limit;
    let where = 'WHERE 1=1';
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filters.status) {
      where += ` AND status = $${paramIndex++}`;
      values.push(filters.status);
    }
    if (filters.isLocked !== undefined) {
      where += ` AND is_locked = $${paramIndex++}`;
      values.push(filters.isLocked);
    }

    const searchClause = buildNormalizedSearchClause(
      ['batch_code', 'description', 'status', 'face_value_paise::text', 'total_count::text'],
      filters.search,
      paramIndex
    );
    where += searchClause.sql;
    values.push(...searchClause.params);
    paramIndex = searchClause.nextParamIndex;

    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM coupon_batches ${where}`,
      values
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    values.push(limit, offset);
    const result = await db.query<CouponBatch>(
      `SELECT * FROM coupon_batches ${where}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      values
    );
    return { rows: result.rows, total };
  }

  async updateStatus(
    id: string,
    status: CouponBatchStatus,
    generatedCount?: number,
    client?: PoolClient
  ): Promise<CouponBatch | null> {
    const query =
      generatedCount !== undefined
        ? `UPDATE coupon_batches SET status = $2, generated_count = $3 WHERE coupon_batch_id = $1 RETURNING *`
        : `UPDATE coupon_batches SET status = $2 WHERE coupon_batch_id = $1 RETURNING *`;
    const values =
      generatedCount !== undefined ? [id, status, generatedCount] : [id, status];
    const result = client
      ? await client.query<CouponBatch>(query, values)
      : await db.query<CouponBatch>(query, values);
    return result.rows[0] || null;
  }

  async setLocked(
    id: string,
    locked: boolean,
    lockedBy?: string | null,
    client?: PoolClient
  ): Promise<CouponBatch | null> {
    const query = locked
      ? `UPDATE coupon_batches
         SET is_locked = true,
             locked_at = CURRENT_TIMESTAMP,
             locked_by = $2
         WHERE coupon_batch_id = $1
         RETURNING *`
      : `UPDATE coupon_batches
         SET is_locked = false,
             locked_at = NULL,
             locked_by = NULL
         WHERE coupon_batch_id = $1
         RETURNING *`;
    const values = locked ? [id, lockedBy ?? null] : [id];
    const result = client
      ? await client.query<CouponBatch>(query, values)
      : await db.query<CouponBatch>(query, values);
    return result.rows[0] || null;
  }

  /**
   * Per-status counts for a batch. Optional `fromSequence`/`toSequence` scopes the
   * buckets to a serial range so the UI can filter status chips by serials entered.
   */
  async getStats(
    batchId: string,
    options?: {
      fromSequence?: number;
      toSequence?: number;
      from_serial?: string | null;
      to_serial?: string | null;
      client?: PoolClient;
    }
  ): Promise<CouponBatchStats> {
    const client = options?.client;
    const values: unknown[] = [batchId];
    let where = 'WHERE coupon_batch_id = $1';
    if (options?.fromSequence != null && options?.toSequence != null) {
      where += ' AND batch_sequence BETWEEN $2 AND $3';
      values.push(options.fromSequence, options.toSequence);
    }

    const query = `
      SELECT status, COUNT(*)::int AS count
      FROM coupons
      ${where}
      GROUP BY status
    `;
    const result = client
      ? await client.query<{ status: string; count: number }>(query, values)
      : await db.query<{ status: string; count: number }>(query, values);

    const stats: CouponBatchStats = {
      created: 0,
      printed: 0,
      allotted: 0,
      redeemed: 0,
      expired: 0,
      void: 0,
      redemption_rate: 0,
    };

    for (const row of result.rows) {
      const key = row.status as keyof Pick<
        CouponBatchStats,
        'created' | 'printed' | 'allotted' | 'redeemed' | 'expired' | 'void'
      >;
      if (key in stats) {
        stats[key] = row.count;
      }
    }

    const inMarket = stats.allotted + stats.redeemed;
    stats.redemption_rate = inMarket > 0 ? Math.round((stats.redeemed / inMarket) * 1000) / 10 : 0;
    stats.scoped_count =
      stats.created +
      stats.printed +
      stats.allotted +
      stats.redeemed +
      stats.expired +
      stats.void;
    if (options?.fromSequence != null) {
      stats.from_serial = options.from_serial ?? null;
      stats.to_serial = options.to_serial ?? null;
    }

    return stats;
  }

  async countRedemptions(batchId: string, client?: PoolClient): Promise<number> {
    const query = `SELECT COUNT(*)::text AS count FROM redemptions WHERE coupon_batch_id = $1`;
    const result = client
      ? await client.query<{ count: string }>(query, [batchId])
      : await db.query<{ count: string }>(query, [batchId]);
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }

  async delete(batchId: string, client: PoolClient): Promise<boolean> {
    await client.query(`DELETE FROM coupons WHERE coupon_batch_id = $1`, [batchId]);
    const result = await client.query(
      `DELETE FROM coupon_batches WHERE coupon_batch_id = $1`,
      [batchId]
    );
    return (result.rowCount ?? 0) > 0;
  }
}
