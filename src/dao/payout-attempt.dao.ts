import { PoolClient } from 'pg';
import { db } from '../database/connection';
import { PayoutAttempt } from '../models/coupon.model';
import type { PayoutAttemptStatus } from '../constants/coupon-status';

export class PayoutAttemptDAO {
  async create(
    data: {
      redemption_id: string;
      amount_paise: number;
      status: PayoutAttemptStatus;
      transfer_id: string;
    },
    client?: PoolClient
  ): Promise<PayoutAttempt> {
    const query = `
      INSERT INTO payout_attempts (redemption_id, amount_paise, status, transfer_id)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const values = [data.redemption_id, data.amount_paise, data.status, data.transfer_id];
    const result = client
      ? await client.query<PayoutAttempt>(query, values)
      : await db.query<PayoutAttempt>(query, values);
    return result.rows[0];
  }

  async updateStatus(
    id: string,
    status: PayoutAttemptStatus,
    data?: {
      provider_transfer_id?: string;
      failure_reason?: string;
    },
    client?: PoolClient
  ): Promise<PayoutAttempt | null> {
    // Cast $2 explicitly — PG errors with "inconsistent types deduced for parameter $2"
    // when the same param is used both as a column assignment and in CASE ... IN (...).
    const query = `
      UPDATE payout_attempts SET
        status = $2::text,
        provider_transfer_id = COALESCE($3, provider_transfer_id),
        failure_reason = COALESCE($4, failure_reason),
        completed_at = CASE
          WHEN $2::text IN ('success', 'failed') THEN NOW()
          ELSE completed_at
        END
      WHERE payout_attempt_id = $1
      RETURNING *
    `;
    const values = [
      id,
      status,
      data?.provider_transfer_id ?? null,
      data?.failure_reason ?? null,
    ];
    const result = client
      ? await client.query<PayoutAttempt>(query, values)
      : await db.query<PayoutAttempt>(query, values);
    return result.rows[0] || null;
  }

  async findByTransferId(transferId: string): Promise<PayoutAttempt | null> {
    const result = await db.query<PayoutAttempt>(
      `SELECT * FROM payout_attempts WHERE transfer_id = $1`,
      [transferId]
    );
    return result.rows[0] || null;
  }

  async findByProviderTransferId(providerTransferId: string): Promise<PayoutAttempt | null> {
    const result = await db.query<PayoutAttempt>(
      `SELECT * FROM payout_attempts WHERE provider_transfer_id = $1`,
      [providerTransferId]
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

  /** Initiated attempts for Cashfree status reconcile (worker poll). */
  async findInitiatedForReconcile(limit = 50): Promise<PayoutAttempt[]> {
    const result = await db.query<PayoutAttempt>(
      `SELECT pa.*
       FROM payout_attempts pa
       INNER JOIN redemptions r ON r.redemption_id = pa.redemption_id
       WHERE pa.status = 'initiated'
         AND pa.transfer_id IS NOT NULL
         AND r.payout_status = 'pending'
       ORDER BY pa.created_at ASC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }
}
