import { PoolClient } from 'pg';
import { db } from '../database/connection';
import { Redemption } from '../models/coupon.model';
import type { RedemptionPaidVia, RedemptionPayoutStatus } from '../constants/coupon-status';
import { appendDateRangeConditions } from '../utils/analytics-date-filter';

export interface CreateRedemptionInput {
  public_ref: string;
  coupon_id: string;
  redeemer_id: string;
  coupon_batch_id: string;
  code: string;
  base_amount_paise: number;
  bonus_amount_paise: number;
  total_amount_paise: number;
  payout_upi_vpa?: string | null;
  payout_account_holder_name?: string | null;
  payout_account_number?: string | null;
  payout_ifsc?: string | null;
  payout_bank_name?: string | null;
  idempotency_key: string;
  redeemed_ip?: string | null;
  redeemed_user_agent?: string | null;
}

export class RedemptionDAO {
  async findByIdempotencyKey(key: string, client?: PoolClient): Promise<Redemption | null> {
    const query = `SELECT * FROM redemptions WHERE idempotency_key = $1`;
    const result = client
      ? await client.query<Redemption>(query, [key])
      : await db.query<Redemption>(query, [key]);
    return result.rows[0] || null;
  }

  async findById(id: string, client?: PoolClient): Promise<Redemption | null> {
    const query = `SELECT * FROM redemptions WHERE redemption_id = $1`;
    const result = client
      ? await client.query<Redemption>(query, [id])
      : await db.query<Redemption>(query, [id]);
    return result.rows[0] || null;
  }

  async findByIdForUpdate(id: string, client: PoolClient): Promise<Redemption | null> {
    const result = await client.query<Redemption>(
      `SELECT * FROM redemptions WHERE redemption_id = $1 FOR UPDATE`,
      [id]
    );
    return result.rows[0] || null;
  }

  async create(data: CreateRedemptionInput, client: PoolClient): Promise<Redemption> {
    const query = `
      INSERT INTO redemptions (
        public_ref, coupon_id, redeemer_id, coupon_batch_id, code,
        base_amount_paise, bonus_amount_paise, total_amount_paise,
        payout_upi_vpa, payout_account_holder_name, payout_account_number, payout_ifsc,
        payout_bank_name,
        idempotency_key, redeemed_ip, redeemed_user_agent, payout_status
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'pending')
      RETURNING *
    `;
    const values = [
      data.public_ref,
      data.coupon_id,
      data.redeemer_id,
      data.coupon_batch_id,
      data.code,
      data.base_amount_paise,
      data.bonus_amount_paise,
      data.total_amount_paise,
      data.payout_upi_vpa ?? null,
      data.payout_account_holder_name ?? null,
      data.payout_account_number ?? null,
      data.payout_ifsc ?? null,
      data.payout_bank_name ?? null,
      data.idempotency_key,
      data.redeemed_ip ?? null,
      data.redeemed_user_agent ?? null,
    ];
    const result = await client.query<Redemption>(query, values);
    return result.rows[0];
  }

  async markPaid(
    id: string,
    data: {
      payment_reference: string;
      paid_via: RedemptionPaidVia;
      paid_by?: string | null;
    },
    client?: PoolClient
  ): Promise<Redemption | null> {
    const query = `
      UPDATE redemptions SET
        payout_status = 'paid',
        paid_at = NOW(),
        paid_via = $2,
        payment_reference = $3,
        paid_by = $4,
        last_payout_error = NULL
      WHERE redemption_id = $1 AND payout_status = 'pending'
      RETURNING *
    `;
    const values = [id, data.paid_via, data.payment_reference, data.paid_by ?? null];
    const result = client
      ? await client.query<Redemption>(query, values)
      : await db.query<Redemption>(query, values);
    return result.rows[0] || null;
  }

  async setLastPayoutError(id: string, error: string, client?: PoolClient): Promise<void> {
    const query = `UPDATE redemptions SET last_payout_error = $2 WHERE redemption_id = $1`;
    if (client) {
      await client.query(query, [id, error]);
    } else {
      await db.query(query, [id, error]);
    }
  }

  async findAll(filters: {
    payoutStatus?: RedemptionPayoutStatus;
    batchId?: string;
    phone?: string;
    code?: string;
    fromDate?: string;
    toDate?: string;
    page?: number;
    limit?: number;
  }): Promise<{ rows: Redemption[]; total: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;
    const offset = (page - 1) * limit;
    const conditions = ['1=1'];
    const values: unknown[] = [];
    let i = 1;

    if (filters.payoutStatus) {
      conditions.push(`r.payout_status = $${i++}`);
      values.push(filters.payoutStatus);
    }
    if (filters.batchId) {
      conditions.push(`r.coupon_batch_id = $${i++}`);
      values.push(filters.batchId);
    }
    if (filters.code) {
      conditions.push(`r.code = $${i++}`);
      values.push(filters.code.toUpperCase());
    }
    if (filters.phone) {
      conditions.push(`rd.phone = $${i++}`);
      values.push(filters.phone);
    }
    appendDateRangeConditions(conditions, values, 'r.created_at', filters.fromDate, filters.toDate);

    const where = conditions.join(' AND ');
    const join = filters.phone ? 'JOIN redeemers rd ON rd.redeemer_id = r.redeemer_id' : '';

    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM redemptions r ${join} WHERE ${where}`,
      values
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    values.push(limit, offset);
    const limitIdx = values.length - 1;
    const offsetIdx = values.length;
    const result = await db.query<Redemption>(
      `SELECT r.* FROM redemptions r ${join} WHERE ${where} ORDER BY r.created_at DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      values
    );
    return { rows: result.rows, total };
  }

  async findPendingForPayout(limit = 50, client?: PoolClient): Promise<Redemption[]> {
    const query = `
      SELECT r.* FROM redemptions r
      WHERE r.payout_status = 'pending'
        AND NOT EXISTS (
          SELECT 1 FROM payout_attempts pa
          WHERE pa.redemption_id = r.redemption_id AND pa.status = 'initiated'
        )
      ORDER BY r.created_at ASC
      LIMIT $1
    `;
    const result = client
      ? await client.query<Redemption>(query, [limit])
      : await db.query<Redemption>(query, [limit]);
    return result.rows;
  }

  async findByRedeemerId(redeemerId: string): Promise<Redemption[]> {
    const result = await db.query<Redemption>(
      `SELECT * FROM redemptions WHERE redeemer_id = $1 ORDER BY created_at DESC`,
      [redeemerId]
    );
    return result.rows;
  }

  async unmarkPaid(id: string, client?: PoolClient): Promise<Redemption | null> {
    const query = `
      UPDATE redemptions SET
        payout_status = 'pending',
        paid_at = NULL,
        paid_via = NULL,
        payment_reference = NULL,
        paid_by = NULL
      WHERE redemption_id = $1 AND payout_status = 'paid'
      RETURNING *
    `;
    const result = client
      ? await client.query<Redemption>(query, [id])
      : await db.query<Redemption>(query, [id]);
    return result.rows[0] || null;
  }
}
