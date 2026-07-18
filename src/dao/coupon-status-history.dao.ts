import { PoolClient } from 'pg';
import { db } from '../database/connection';
import { CouponStatusHistory } from '../models/coupon.model';
import type { CouponStatus } from '../constants/coupon-status';

export class CouponStatusHistoryDAO {
  async insert(
    data: {
      coupon_id: string;
      from_status: CouponStatus | null;
      to_status: CouponStatus;
      changed_by?: string | null;
      reason?: string | null;
      metadata?: Record<string, unknown> | null;
    },
    client?: PoolClient
  ): Promise<CouponStatusHistory> {
    const query = `
      INSERT INTO coupon_status_history (
        coupon_id, from_status, to_status, changed_by, reason, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const values = [
      data.coupon_id,
      data.from_status,
      data.to_status,
      data.changed_by ?? null,
      data.reason ?? null,
      data.metadata ? JSON.stringify(data.metadata) : null,
    ];
    const result = client
      ? await client.query<CouponStatusHistory>(query, values)
      : await db.query<CouponStatusHistory>(query, values);
    return result.rows[0];
  }

  async bulkInsert(
    rows: Array<{
      coupon_id: string;
      from_status: CouponStatus | null;
      to_status: CouponStatus;
      changed_by?: string | null;
      reason?: string | null;
      metadata?: Record<string, unknown> | null;
    }>,
    client?: PoolClient
  ): Promise<void> {
    if (rows.length === 0) return;

    const values: unknown[] = [];
    const placeholders: string[] = [];
    let i = 1;

    for (const row of rows) {
      placeholders.push(`($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++})`);
      values.push(
        row.coupon_id,
        row.from_status,
        row.to_status,
        row.changed_by ?? null,
        row.reason ?? null,
        row.metadata ? JSON.stringify(row.metadata) : null
      );
    }

    const query = `
      INSERT INTO coupon_status_history (
        coupon_id, from_status, to_status, changed_by, reason, metadata
      )
      VALUES ${placeholders.join(', ')}
    `;
    if (client) {
      await client.query(query, values);
    } else {
      await db.query(query, values);
    }
  }

  async findByCouponId(couponId: string): Promise<CouponStatusHistory[]> {
    const result = await db.query<CouponStatusHistory>(
      `SELECT * FROM coupon_status_history WHERE coupon_id = $1 ORDER BY created_at ASC`,
      [couponId]
    );
    return result.rows;
  }
}
