import { PoolClient } from 'pg';
import { db } from '../database/connection';
import {
  CreateRazorpayWebhookEventDTO,
  RazorpayWebhookEvent,
} from '../models/coupon.model';
import type { RazorpayWebhookStatus } from '../constants/coupon-status';

export class RazorpayWebhookEventDAO {
  async insertReceived(
    data: CreateRazorpayWebhookEventDTO,
    client?: PoolClient
  ): Promise<{ record: RazorpayWebhookEvent; isDuplicate: boolean }> {
    const insertQuery = `
      INSERT INTO razorpay_webhook_events (
        razorpay_event_id,
        event_type,
        razorpay_payout_id,
        payout_attempt_id,
        redemption_id,
        payload,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'received')
      ON CONFLICT (razorpay_event_id) DO NOTHING
      RETURNING *
    `;
    const values = [
      data.razorpay_event_id,
      data.event_type,
      data.razorpay_payout_id ?? null,
      data.payout_attempt_id ?? null,
      data.redemption_id ?? null,
      JSON.stringify(data.payload),
    ];

    const result = client
      ? await client.query<RazorpayWebhookEvent>(insertQuery, values)
      : await db.query<RazorpayWebhookEvent>(insertQuery, values);

    if (result.rows[0]) {
      return { record: result.rows[0], isDuplicate: false };
    }

    const existing = await this.findByRazorpayEventId(data.razorpay_event_id, client);
    if (!existing) {
      throw new Error('Failed to insert or find Razorpay webhook event');
    }
    return { record: existing, isDuplicate: true };
  }

  async findByRazorpayEventId(
    razorpayEventId: string,
    client?: PoolClient
  ): Promise<RazorpayWebhookEvent | null> {
    const query = `SELECT * FROM razorpay_webhook_events WHERE razorpay_event_id = $1`;
    const result = client
      ? await client.query<RazorpayWebhookEvent>(query, [razorpayEventId])
      : await db.query<RazorpayWebhookEvent>(query, [razorpayEventId]);
    return result.rows[0] || null;
  }

  async markOutcome(
    webhookEventId: string,
    data: {
      status: RazorpayWebhookStatus;
      razorpay_payout_id?: string | null;
      payout_attempt_id?: string | null;
      redemption_id?: string | null;
      error_message?: string | null;
    },
    client?: PoolClient
  ): Promise<RazorpayWebhookEvent | null> {
    const query = `
      UPDATE razorpay_webhook_events SET
        status = $2,
        razorpay_payout_id = COALESCE($3, razorpay_payout_id),
        payout_attempt_id = COALESCE($4, payout_attempt_id),
        redemption_id = COALESCE($5, redemption_id),
        error_message = $6,
        processed_at = NOW()
      WHERE webhook_event_id = $1
      RETURNING *
    `;
    const values = [
      webhookEventId,
      data.status,
      data.razorpay_payout_id ?? null,
      data.payout_attempt_id ?? null,
      data.redemption_id ?? null,
      data.error_message ?? null,
    ];
    const result = client
      ? await client.query<RazorpayWebhookEvent>(query, values)
      : await db.query<RazorpayWebhookEvent>(query, values);
    return result.rows[0] || null;
  }

  async findByRedemptionId(redemptionId: string, limit = 50): Promise<RazorpayWebhookEvent[]> {
    const result = await db.query<RazorpayWebhookEvent>(
      `SELECT * FROM razorpay_webhook_events
       WHERE redemption_id = $1
       ORDER BY received_at DESC
       LIMIT $2`,
      [redemptionId, limit]
    );
    return result.rows;
  }
}
