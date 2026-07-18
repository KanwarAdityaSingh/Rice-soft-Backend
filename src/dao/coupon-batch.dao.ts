import { PoolClient } from 'pg';
import { db } from '../database/connection';
import { CouponBatch, CreateCouponBatchDTO, CouponBatchStats } from '../models/coupon.model';
import type { CouponBatchStatus } from '../constants/coupon-status';

export class CouponBatchDAO {
  async create(data: CreateCouponBatchDTO, client?: PoolClient): Promise<CouponBatch> {
    const query = `
      INSERT INTO coupon_batches (
        name, description, face_value_paise, total_count, expires_at,
        redeem_base_url, created_by, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft')
      RETURNING *
    `;
    const values = [
      data.name,
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

  async findAll(page = 1, limit = 50): Promise<{ rows: CouponBatch[]; total: number }> {
    const offset = (page - 1) * limit;
    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM coupon_batches`
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);
    const result = await db.query<CouponBatch>(
      `SELECT * FROM coupon_batches ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
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

  async getStats(batchId: string, client?: PoolClient): Promise<CouponBatchStats> {
    const query = `
      SELECT status, COUNT(*)::int AS count
      FROM coupons
      WHERE coupon_batch_id = $1
      GROUP BY status
    `;
    const result = client
      ? await client.query<{ status: string; count: number }>(query, [batchId])
      : await db.query<{ status: string; count: number }>(query, [batchId]);

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
      const key = row.status as keyof Omit<CouponBatchStats, 'redemption_rate'>;
      if (key in stats) {
        stats[key] = row.count;
      }
    }

    const inMarket = stats.allotted + stats.redeemed;
    stats.redemption_rate = inMarket > 0 ? Math.round((stats.redeemed / inMarket) * 1000) / 10 : 0;

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
