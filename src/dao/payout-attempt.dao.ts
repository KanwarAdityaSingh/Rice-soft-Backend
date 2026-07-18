import { PoolClient } from 'pg';
import { db } from '../database/connection';
import { PayoutAttempt } from '../models/coupon.model';
import type { PayoutAttemptStatus } from '../constants/coupon-status';

export class PayoutAttemptDAO {
  async create(
    data: { redemption_id: string; amount_paise: number; status: PayoutAttemptStatus },
    client?: PoolClient
  ): Promise<PayoutAttempt> {
    const query = `
      INSERT INTO payout_attempts (redemption_id, amount_paise, status)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const values = [data.redemption_id, data.amount_paise, data.status];
    const result = client
      ? await client.query<PayoutAttempt>(query, values)
      : await db.query<PayoutAttempt>(query, values);
    return result.rows[0];
  }

  async updateStatus(
    id: string,
    status: PayoutAttemptStatus,
    data?: { razorpay_payout_id?: string; failure_reason?: string },
    client?: PoolClient
  ): Promise<PayoutAttempt | null> {
    const query = `
      UPDATE payout_attempts SET
        status = $2,
        razorpay_payout_id = COALESCE($3, razorpay_payout_id),
        failure_reason = COALESCE($4, failure_reason),
        completed_at = CASE WHEN $2 IN ('success', 'failed') THEN NOW() ELSE completed_at END
      WHERE payout_attempt_id = $1
      RETURNING *
    `;
    const values = [
      id,
      status,
      data?.razorpay_payout_id ?? null,
      data?.failure_reason ?? null,
    ];
    const result = client
      ? await client.query<PayoutAttempt>(query, values)
      : await db.query<PayoutAttempt>(query, values);
    return result.rows[0] || null;
  }

  async findByRazorpayPayoutId(payoutId: string): Promise<PayoutAttempt | null> {
    const result = await db.query<PayoutAttempt>(
      `SELECT * FROM payout_attempts WHERE razorpay_payout_id = $1`,
      [payoutId]
    );
    return result.rows[0] || null;
  }

  async findByRedemptionId(redemptionId: string): Promise<PayoutAttempt[]> {
    const result = await db.query<PayoutAttempt>(
      `SELECT * FROM payout_attempts WHERE redemption_id = $1 ORDER BY created_at ASC`,
      [redemptionId]
    );
    return result.rows;
  }

  async findInitiatedByRedemptionId(
    redemptionId: string,
    client: PoolClient
  ): Promise<PayoutAttempt | null> {
    const result = await client.query<PayoutAttempt>(
      `SELECT * FROM payout_attempts
       WHERE redemption_id = $1 AND status = 'initiated'
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [redemptionId]
    );
    return result.rows[0] || null;
  }
}
