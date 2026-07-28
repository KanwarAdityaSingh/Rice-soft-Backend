import { PoolClient } from 'pg';
import { db } from '../database/connection';
import {
  CreateCashfreeWebhookEventDTO,
  CashfreeWebhookEvent,
} from '../models/coupon.model';
import type { PayoutWebhookStatus } from '../constants/coupon-status';

export class CashfreeWebhookEventDAO {
  async insertReceived(
    data: CreateCashfreeWebhookEventDTO,
    client?: PoolClient
  ): Promise<{ record: CashfreeWebhookEvent; isDuplicate: boolean }> {
    const insertQuery = `
      INSERT INTO cashfree_webhook_events (
        cashfree_event_id,
        event_type,
        transfer_id,
        provider_transfer_id,
        payout_attempt_id,
        redemption_id,
        payload,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'received')
      ON CONFLICT (cashfree_event_id) DO NOTHING
      RETURNING *
    `;
    const values = [
      data.cashfree_event_id,
      data.event_type,
      data.transfer_id ?? null,
      data.provider_transfer_id ?? null,
      data.payout_attempt_id ?? null,
      data.redemption_id ?? null,
      JSON.stringify(data.payload),
    ];

    const result = client
      ? await client.query<CashfreeWebhookEvent>(insertQuery, values)
      : await db.query<CashfreeWebhookEvent>(insertQuery, values);

    if (result.rows[0]) {
      return { record: result.rows[0], isDuplicate: false };
    }

    const existing = await this.findByCashfreeEventId(data.cashfree_event_id, client);
    if (!existing) {
      throw new Error('Failed to insert or find Cashfree webhook event');
    }
    return { record: existing, isDuplicate: true };
  }

  async findByCashfreeEventId(
    cashfreeEventId: string,
    client?: PoolClient
  ): Promise<CashfreeWebhookEvent | null> {
    const query = `SELECT * FROM cashfree_webhook_events WHERE cashfree_event_id = $1`;
    const result = client
      ? await client.query<CashfreeWebhookEvent>(query, [cashfreeEventId])
      : await db.query<CashfreeWebhookEvent>(query, [cashfreeEventId]);
    return result.rows[0] || null;
  }

  async markOutcome(
    webhookEventId: string,
    data: {
      status: PayoutWebhookStatus;
      transfer_id?: string | null;
      provider_transfer_id?: string | null;
      payout_attempt_id?: string | null;
      redemption_id?: string | null;
      error_message?: string | null;
    },
    client?: PoolClient
  ): Promise<CashfreeWebhookEvent | null> {
    const query = `
      UPDATE cashfree_webhook_events SET
        status = $2,
        transfer_id = COALESCE($3, transfer_id),
        provider_transfer_id = COALESCE($4, provider_transfer_id),
        payout_attempt_id = COALESCE($5, payout_attempt_id),
        redemption_id = COALESCE($6, redemption_id),
        error_message = $7,
        processed_at = NOW()
      WHERE webhook_event_id = $1
      RETURNING *
    `;
    const values = [
      webhookEventId,
      data.status,
      data.transfer_id ?? null,
      data.provider_transfer_id ?? null,
      data.payout_attempt_id ?? null,
      data.redemption_id ?? null,
      data.error_message ?? null,
    ];
    const result = client
      ? await client.query<CashfreeWebhookEvent>(query, values)
      : await db.query<CashfreeWebhookEvent>(query, values);
    return result.rows[0] || null;
  }

  async findByRedemptionId(redemptionId: string, limit = 50): Promise<CashfreeWebhookEvent[]> {
    const result = await db.query<CashfreeWebhookEvent>(
      `SELECT * FROM cashfree_webhook_events
       WHERE redemption_id = $1
       ORDER BY received_at DESC
       LIMIT $2`,
      [redemptionId, limit]
    );
    return result.rows;
  }
}
