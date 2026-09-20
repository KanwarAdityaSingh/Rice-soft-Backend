import { PoolClient } from 'pg';
import { db } from '../database/connection';
import { Coupon, CouponListFilters, CouponListResult } from '../models/coupon.model';
import type { CouponStatus } from '../constants/coupon-status';
import { buildNormalizedSearchClause } from '../utils/search';

export class CouponDAO {
  async bulkInsert(
    rows: Array<{
      code: string;
      coupon_batch_id: string;
      face_value_paise: number;
      expires_at: Date | string | null;
      batch_sequence: number;
      serial_number: string;
    }>,
    client?: PoolClient
  ): Promise<{ insertedCount: number; couponIds: string[] }> {
    if (rows.length === 0) return { insertedCount: 0, couponIds: [] };

    const values: unknown[] = [];
    const placeholders: string[] = [];
    let i = 1;

    for (const row of rows) {
      placeholders.push(
        `($${i++}, $${i++}, $${i++}, $${i++}, 'created', $${i++}, $${i++})`
      );
      values.push(
        row.code,
        row.coupon_batch_id,
        row.face_value_paise,
        row.expires_at,
        row.batch_sequence,
        row.serial_number
      );
    }

    const query = `
      INSERT INTO coupons (
        code, coupon_batch_id, face_value_paise, expires_at, status,
        batch_sequence, serial_number
      )
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (code) DO NOTHING
      RETURNING coupon_id
    `;
    const result = client
      ? await client.query<{ coupon_id: string }>(query, values)
      : await db.query<{ coupon_id: string }>(query, values);
    return {
      insertedCount: result.rowCount ?? 0,
      couponIds: result.rows.map((r) => r.coupon_id),
    };
  }

  async countByBatchId(batchId: string, client?: PoolClient): Promise<number> {
    const query = `SELECT COUNT(*)::text AS count FROM coupons WHERE coupon_batch_id = $1`;
    const result = client
      ? await client.query<{ count: string }>(query, [batchId])
      : await db.query<{ count: string }>(query, [batchId]);
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }

  /** Count coupons that have left the pre-print `created` state. */
  async countNonCreatedByBatchId(batchId: string, client?: PoolClient): Promise<number> {
    const query = `
      SELECT COUNT(*)::text AS count
      FROM coupons
      WHERE coupon_batch_id = $1 AND status <> 'created'
    `;
    const result = client
      ? await client.query<{ count: string }>(query, [batchId])
      : await db.query<{ count: string }>(query, [batchId]);
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }

  async maxBatchSequence(batchId: string, client?: PoolClient): Promise<number> {
    const query = `
      SELECT COALESCE(MAX(batch_sequence), 0)::int AS max_seq
      FROM coupons
      WHERE coupon_batch_id = $1
    `;
    const result = client
      ? await client.query<{ max_seq: number }>(query, [batchId])
      : await db.query<{ max_seq: number }>(query, [batchId]);
    return result.rows[0]?.max_seq ?? 0;
  }

  async findByCode(code: string, client?: PoolClient): Promise<Coupon | null> {
    const query = `SELECT * FROM coupons WHERE code = $1`;
    const result = client
      ? await client.query<Coupon>(query, [code])
      : await db.query<Coupon>(query, [code]);
    return result.rows[0] || null;
  }

  async findByCodeForUpdate(code: string, client: PoolClient): Promise<Coupon | null> {
    const result = await client.query<Coupon>(
      `SELECT * FROM coupons WHERE code = $1 FOR UPDATE`,
      [code]
    );
    return result.rows[0] || null;
  }

  async findById(id: string, client?: PoolClient): Promise<Coupon | null> {
    const query = `SELECT * FROM coupons WHERE coupon_id = $1`;
    const result = client
      ? await client.query<Coupon>(query, [id])
      : await db.query<Coupon>(query, [id]);
    return result.rows[0] || null;
  }

  async updateStatus(
    couponId: string,
    status: CouponStatus,
    redeemedAt: Date | null,
    client: PoolClient
  ): Promise<Coupon | null> {
    const result = await client.query<Coupon>(
      `UPDATE coupons SET status = $2, redeemed_at = $3 WHERE coupon_id = $1 RETURNING *`,
      [couponId, status, redeemedAt]
    );
    return result.rows[0] || null;
  }

  /** Optimistic guard — only updates when current status matches `fromStatus`. */
  async updateStatusIf(
    couponId: string,
    fromStatus: CouponStatus,
    toStatus: CouponStatus,
    redeemedAt: Date | null,
    client: PoolClient
  ): Promise<Coupon | null> {
    const result = await client.query<Coupon>(
      `UPDATE coupons SET status = $3, redeemed_at = $4
       WHERE coupon_id = $1 AND status = $2
       RETURNING *`,
      [couponId, fromStatus, toStatus, redeemedAt]
    );
    return result.rows[0] || null;
  }

  async bulkTransitionStatus(
    batchId: string,
    fromStatus: CouponStatus,
    toStatus: CouponStatus,
    client?: PoolClient
  ): Promise<Coupon[]> {
    const query = `
      UPDATE coupons
      SET status = $3
      WHERE coupon_batch_id = $1 AND status = $2
      RETURNING *
    `;
    const result = client
      ? await client.query<Coupon>(query, [batchId, fromStatus, toStatus])
      : await db.query<Coupon>(query, [batchId, fromStatus, toStatus]);
    return result.rows;
  }

  async voidByBatch(batchId: string, client?: PoolClient): Promise<number> {
    const query = `
      UPDATE coupons SET status = 'void'
      WHERE coupon_batch_id = $1 AND status NOT IN ('redeemed', 'void', 'expired')
    `;
    const result = client
      ? await client.query(query, [batchId])
      : await db.query(query, [batchId]);
    return result.rowCount ?? 0;
  }

  async voidByCode(code: string, client?: PoolClient): Promise<Coupon | null> {
    const query = `
      UPDATE coupons SET status = 'void'
      WHERE code = $1 AND status NOT IN ('redeemed', 'void', 'expired')
      RETURNING *
    `;
    const result = client
      ? await client.query<Coupon>(query, [code])
      : await db.query<Coupon>(query, [code]);
    return result.rows[0] || null;
  }

  /**
   * Build the shared WHERE for inventory list + faceted status counts.
   * `includeStatus` = false omits the status/excludeVoid clause so chip counts
   * stay accurate when the user filters by a specific status.
   */
  private buildListWhere(
    filters: CouponListFilters & {
      fromSequence?: number;
      toSequence?: number;
    },
    includeStatus: boolean,
    paramStart: number
  ): { where: string; values: unknown[]; nextParamIndex: number } {
    let where = 'WHERE 1=1';
    const values: unknown[] = [];
    let i = paramStart;

    if (filters.batchId) {
      where += ` AND coupon_batch_id = $${i++}`;
      values.push(filters.batchId);
    }
    if (filters.fromSequence != null && filters.toSequence != null) {
      where += ` AND batch_sequence BETWEEN $${i++} AND $${i++}`;
      values.push(filters.fromSequence, filters.toSequence);
    } else if (filters.from_serial && filters.to_serial) {
      // Cross-batch fallback when no batchId — zero-padded serials compare lexicographically.
      where += ` AND UPPER(serial_number) BETWEEN $${i++} AND $${i++}`;
      values.push(filters.from_serial.trim().toUpperCase(), filters.to_serial.trim().toUpperCase());
    }
    if (includeStatus) {
      if (filters.status) {
        where += ` AND status = $${i++}`;
        values.push(filters.status);
      } else if (filters.excludeVoid) {
        where += ` AND status <> 'void'`;
      }
    }
    if (filters.code) {
      where += ` AND code ILIKE $${i++}`;
      values.push(`${filters.code}%`);
    }

    const searchClause = buildNormalizedSearchClause(
      ['code', 'serial_number', 'status', 'batch_sequence::text'],
      filters.search,
      i
    );
    where += searchClause.sql;
    values.push(...searchClause.params);
    i = searchClause.nextParamIndex;

    return { where, values, nextParamIndex: i };
  }

  async findAll(
    filters: CouponListFilters & {
      fromSequence?: number;
      toSequence?: number;
    }
  ): Promise<CouponListResult> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;
    const offset = (page - 1) * limit;

    const list = this.buildListWhere(filters, true, 1);
    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM coupons ${list.where}`,
      list.values
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const listValues = [...list.values, limit, offset];
    let i = list.nextParamIndex;
    const result = await db.query<Coupon>(
      `SELECT * FROM coupons ${list.where}
       ORDER BY batch_sequence ASC NULLS LAST, created_at DESC
       LIMIT $${i++} OFFSET $${i}`,
      listValues
    );

    // Faceted status counts: same scope (batch / serial / search) but ignore status chip.
    const facet = this.buildListWhere(filters, false, 1);
    const facetResult = await db.query<{ status: string; count: number }>(
      `SELECT status, COUNT(*)::int AS count FROM coupons ${facet.where} GROUP BY status`,
      facet.values
    );
    const status_counts: CouponListResult['status_counts'] = {
      created: 0,
      printed: 0,
      allotted: 0,
      redeemed: 0,
      expired: 0,
      void: 0,
    };
    for (const row of facetResult.rows) {
      const key = row.status as keyof typeof status_counts;
      if (key in status_counts) status_counts[key] = row.count;
    }

    return { rows: result.rows, total, status_counts };
  }

  async expireEligible(
    client?: PoolClient
  ): Promise<Array<Coupon & { previous_status: CouponStatus }>> {
    const query = `
      UPDATE coupons c
      SET status = 'expired'
      FROM (
        SELECT coupon_id, status AS previous_status
        FROM coupons
        WHERE status IN ('printed', 'allotted') 
          AND expires_at IS NOT NULL
          AND expires_at < NOW()
      ) exp
      WHERE c.coupon_id = exp.coupon_id
      RETURNING c.*, exp.previous_status
    `;
    const result = client
      ? await client.query<Coupon & { previous_status: CouponStatus }>(query)
      : await db.query<Coupon & { previous_status: CouponStatus }>(query);
    return result.rows;
  }
}
