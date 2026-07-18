import { PoolClient } from 'pg';
import { db } from '../database/connection';
import { Coupon } from '../models/coupon.model';
import type { CouponStatus } from '../constants/coupon-status';

export class CouponDAO {
  async bulkInsert(
    rows: Array<{
      code: string;
      coupon_batch_id: string;
      face_value_paise: number;
      expires_at: Date | string | null;
    }>,
    client?: PoolClient
  ): Promise<{ insertedCount: number; couponIds: string[] }> {
    if (rows.length === 0) return { insertedCount: 0, couponIds: [] };

    const values: unknown[] = [];
    const placeholders: string[] = [];
    let i = 1;

    for (const row of rows) {
      placeholders.push(`($${i++}, $${i++}, $${i++}, $${i++}, 'created')`);
      values.push(row.code, row.coupon_batch_id, row.face_value_paise, row.expires_at);
    }

    const query = `
      INSERT INTO coupons (code, coupon_batch_id, face_value_paise, expires_at, status)
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

  async findAll(filters: {
    batchId?: string;
    status?: CouponStatus;
    code?: string;
    page?: number;
    limit?: number;
  }): Promise<{ rows: Coupon[]; total: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;
    const offset = (page - 1) * limit;
    const conditions: string[] = ['1=1'];
    const values: unknown[] = [];
    let i = 1;

    if (filters.batchId) {
      conditions.push(`coupon_batch_id = $${i++}`);
      values.push(filters.batchId);
    }
    if (filters.status) {
      conditions.push(`status = $${i++}`);
      values.push(filters.status);
    }
    if (filters.code) {
      conditions.push(`code ILIKE $${i++}`);
      values.push(`${filters.code}%`);
    }

    const where = conditions.join(' AND ');
    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM coupons WHERE ${where}`,
      values
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    values.push(limit, offset);
    const result = await db.query<Coupon>(
      `SELECT * FROM coupons WHERE ${where} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i}`,
      values
    );
    return { rows: result.rows, total };
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
