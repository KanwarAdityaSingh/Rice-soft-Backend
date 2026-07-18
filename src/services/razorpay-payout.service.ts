import { createHash } from 'crypto';
import { db } from '../database/connection';
import { PayoutAttemptDAO } from '../dao/payout-attempt.dao';
import { RazorpayWebhookEventDAO } from '../dao/razorpay-webhook-event.dao';
import { RedemptionDAO } from '../dao/redemption.dao';
import { appConfig } from '../config/app.config';
import { logger } from '../utils/logger';
import { BadRequestError } from '../utils/errors';
import { PayoutAttempt } from '../models/coupon.model';

interface RazorpayPayoutResponse {
  id?: string;
  status?: string;
  failure_reason?: string;
}

interface RazorpayPayoutEntity {
  id?: string;
  status?: string;
  failure_reason?: string;
  created_at?: number;
}

type WebhookProcessOutcome = 'processed' | 'ignored';

export class RazorpayPayoutService {
  constructor(
    private redemptionDAO = new RedemptionDAO(),
    private payoutAttemptDAO = new PayoutAttemptDAO(),
    private webhookEventDAO = new RazorpayWebhookEventDAO()
  ) {}

  async processRedemption(redemptionId: string): Promise<void> {
    if (!appConfig.coupons.payoutEnabled) return;

    const { keyId, keySecret, accountNumber } = appConfig.razorpay;
    if (!keyId || !keySecret || !accountNumber) {
      logger.warn('Razorpay payout skipped: missing configuration');
      return;
    }

    const attempt = await this.acquirePayoutAttempt(redemptionId);
    if (!attempt) return;

    await this.executeRazorpayPayout(redemptionId, attempt, { keyId, keySecret, accountNumber });
  }

  /**
   * Lock redemption row, ensure pending status, and create exactly one initiated attempt.
   * Returns null when payout should not proceed (already paid, in-flight attempt, missing UPI, etc.).
   */
  private async acquirePayoutAttempt(redemptionId: string): Promise<PayoutAttempt | null> {
    try {
      return await db.transaction(async (client) => {
        const redemption = await this.redemptionDAO.findByIdForUpdate(redemptionId, client);
        if (!redemption || redemption.payout_status !== 'pending') {
          return null;
        }

        const existing = await this.payoutAttemptDAO.findInitiatedByRedemptionId(
          redemptionId,
          client
        );
        if (existing) {
          logger.info('Razorpay payout skipped: attempt already in flight', { redemptionId });
          return null;
        }

        if (!redemption.payout_upi_vpa) {
          await this.redemptionDAO.setLastPayoutError(
            redemptionId,
            'UPI VPA required for Razorpay payout',
            client
          );
          return null;
        }

        return this.payoutAttemptDAO.create(
          {
            redemption_id: redemptionId,
            amount_paise: redemption.total_amount_paise,
            status: 'initiated',
          },
          client
        );
      });
    } catch (error) {
      // Partial unique index — concurrent caller won the race
      if (error && typeof error === 'object' && (error as { code?: string }).code === '23505') {
        logger.info('Razorpay payout skipped: concurrent attempt detected', { redemptionId });
        return null;
      }
      throw error;
    }
  }

  private async executeRazorpayPayout(
    redemptionId: string,
    attempt: PayoutAttempt,
    creds: { keyId: string; keySecret: string; accountNumber: string }
  ): Promise<void> {
    const redemption = await this.redemptionDAO.findById(redemptionId);
    if (!redemption || redemption.payout_status !== 'pending') return;

    try {
      const referenceId = `coupon_${redemption.public_ref}_${attempt.payout_attempt_id}`;
      const body = {
        account_number: creds.accountNumber,
        amount: redemption.total_amount_paise,
        currency: 'INR',
        mode: 'UPI',
        purpose: 'payout',
        fund_account: {
          account_type: 'vpa',
          vpa: { address: redemption.payout_upi_vpa },
          contact: {
            name: redemption.payout_account_holder_name ?? 'Coupon Redeemer',
            contact: redemption.public_ref,
            type: 'customer',
          },
        },
        queue_if_low_balance: true,
        reference_id: referenceId,
        narration: 'Coupon Redemption',
      };

      const response = await fetch('https://api.razorpay.com/v1/payouts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString('base64')}`,
        },
        body: JSON.stringify(body),
      });

      const payload = (await response.json()) as RazorpayPayoutResponse & {
        error?: { description?: string };
      };

      if (!response.ok) {
        const reason = payload.error?.description ?? payload.failure_reason ?? 'Razorpay payout failed';
        await this.recordPayoutFailure(redemptionId, attempt.payout_attempt_id, reason);
        return;
      }

      await this.payoutAttemptDAO.updateStatus(attempt.payout_attempt_id, 'initiated', {
        razorpay_payout_id: payload.id,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Razorpay request failed';
      await this.recordPayoutFailure(redemptionId, attempt.payout_attempt_id, reason);
      logger.error('Razorpay payout error', { redemptionId, error });
    }
  }

  async handleWebhook(event: string, payload: Record<string, unknown>): Promise<void> {
    const razorpayEventId = this.resolveEventId(event, payload);
    const payoutEntity = this.extractPayoutEntity(payload);
    const razorpayPayoutId = payoutEntity?.id ?? null;

    const attempt = razorpayPayoutId
      ? await this.payoutAttemptDAO.findByRazorpayPayoutId(razorpayPayoutId)
      : null;

    const { record, isDuplicate } = await this.webhookEventDAO.insertReceived({
      razorpay_event_id: razorpayEventId,
      event_type: event,
      razorpay_payout_id: razorpayPayoutId,
      payout_attempt_id: attempt?.payout_attempt_id ?? null,
      redemption_id: attempt?.redemption_id ?? null,
      payload,
    });

    if (isDuplicate && (record.status === 'processed' || record.status === 'ignored')) {
      return;
    }

    try {
      if (!payoutEntity?.id) {
        throw new BadRequestError('Invalid Razorpay webhook payload');
      }

      const outcome = await this.processPayoutWebhook(event, payoutEntity, attempt);

      await this.webhookEventDAO.markOutcome(record.webhook_event_id, {
        status: outcome,
        razorpay_payout_id: payoutEntity.id,
        payout_attempt_id: attempt?.payout_attempt_id ?? null,
        redemption_id: attempt?.redemption_id ?? null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Webhook processing failed';
      await this.webhookEventDAO.markOutcome(record.webhook_event_id, {
        status: 'failed',
        razorpay_payout_id: razorpayPayoutId,
        payout_attempt_id: attempt?.payout_attempt_id ?? null,
        redemption_id: attempt?.redemption_id ?? null,
        error_message: message,
      });
      throw error;
    }
  }

  private async processPayoutWebhook(
    event: string,
    payoutEntity: RazorpayPayoutEntity,
    attempt: PayoutAttempt | null
  ): Promise<WebhookProcessOutcome> {
    if (!attempt) {
      logger.warn('Razorpay webhook for unknown payout', { payoutId: payoutEntity.id });
      return 'ignored';
    }

    if (attempt.status === 'success') {
      return 'ignored';
    }

    if (event === 'payout.processed' || payoutEntity.status === 'processed') {
      await db.transaction(async (client) => {
        await this.payoutAttemptDAO.updateStatus(
          attempt.payout_attempt_id,
          'success',
          { razorpay_payout_id: payoutEntity.id },
          client
        );
        await this.redemptionDAO.markPaid(
          attempt.redemption_id,
          {
            payment_reference: payoutEntity.id!,
            paid_via: 'razorpay',
          },
          client
        );
      });
      return 'processed';
    }

    if (event === 'payout.failed' || event === 'payout.reversed' || payoutEntity.status === 'failed') {
      const reason = payoutEntity.failure_reason ?? event;
      await this.recordPayoutFailure(attempt.redemption_id, attempt.payout_attempt_id, reason);
      return 'processed';
    }

    return 'ignored';
  }

  private extractPayoutEntity(payload: Record<string, unknown>): RazorpayPayoutEntity | undefined {
    return (payload.payload as { payout?: { entity?: RazorpayPayoutEntity } } | undefined)?.payout
      ?.entity;
  }

  private resolveEventId(event: string, payload: Record<string, unknown>): string {
    const topLevelId = payload.id;
    if (typeof topLevelId === 'string' && topLevelId.length > 0) {
      return topLevelId;
    }

    const payoutEntity = this.extractPayoutEntity(payload);
    if (payoutEntity?.id) {
      const createdAt = payload.created_at ?? payoutEntity.created_at ?? 0;
      return `${event}:${payoutEntity.id}:${createdAt}`;
    }

    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private async recordPayoutFailure(
    redemptionId: string,
    attemptId: string,
    reason: string
  ): Promise<void> {
    await db.transaction(async (client) => {
      await this.payoutAttemptDAO.updateStatus(
        attemptId,
        'failed',
        { failure_reason: reason },
        client
      );
      await this.redemptionDAO.setLastPayoutError(redemptionId, reason, client);
    });
  }

  async retryPayout(redemptionId: string): Promise<void> {
    const redemption = await this.redemptionDAO.findById(redemptionId);
    if (!redemption) throw new BadRequestError('Redemption not found');
    if (redemption.payout_status === 'paid') {
      throw new BadRequestError('Redemption is already paid');
    }

    const initiated = (await this.payoutAttemptDAO.findByRedemptionId(redemptionId)).find(
      (a) => a.status === 'initiated'
    );
    if (initiated) {
      throw new BadRequestError('A payout attempt is already in progress');
    }

    await this.processRedemption(redemptionId);
  }
}

export const razorpayPayoutService = new RazorpayPayoutService();
