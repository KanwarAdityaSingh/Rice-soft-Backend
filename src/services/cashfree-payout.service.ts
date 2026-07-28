import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { db } from '../database/connection';
import { PayoutAttemptDAO } from '../dao/payout-attempt.dao';
import { CashfreeWebhookEventDAO } from '../dao/cashfree-webhook-event.dao';
import { RedemptionDAO } from '../dao/redemption.dao';
import { appConfig, cashfreePayoutBaseUrl } from '../config/app.config';
import { logger } from '../utils/logger';
import { BadRequestError } from '../utils/errors';
import { PayoutAttempt, Redemption } from '../models/coupon.model';

interface CashfreeTransferPayload {
  transfer_id?: string;
  cf_transfer_id?: string;
  status?: string;
  status_code?: string;
  status_description?: string;
  transfer_utr?: string;
  message?: string;
}

type TerminalKind = 'success' | 'failure' | 'pending';
type WebhookProcessOutcome = 'processed' | 'ignored';

export type InitiateCashfreePayoutResult = {
  redemptionId: string;
  payout_status: 'pending' | 'paid';
  paid_via: string | null;
  paid_at: string | null;
  payment_reference: string | null;
  last_payout_error: string | null;
  attempt: {
    payout_attempt_id: string;
    status: string;
    transfer_id: string | null;
    provider_transfer_id: string | null;
    failure_reason: string | null;
  } | null;
  message: string;
};

const SUCCESS_STATUSES = new Set(['SUCCESS']);
const FAILURE_STATUSES = new Set([
  'FAILED',
  'REJECTED',
  'REVERSED',
  'MANUALLY_REJECTED',
]);
const SUCCESS_EVENTS = new Set(['TRANSFER_SUCCESS', 'TRANSFER_ACKNOWLEDGED']);
const FAILURE_EVENTS = new Set([
  'TRANSFER_FAILED',
  'TRANSFER_REJECTED',
  'TRANSFER_REVERSED',
]);

export class CashfreePayoutService {
  constructor(
    private redemptionDAO = new RedemptionDAO(),
    private payoutAttemptDAO = new PayoutAttemptDAO(),
    private webhookEventDAO = new CashfreeWebhookEventDAO()
  ) {}

  async processRedemption(redemptionId: string): Promise<void> {
    if (!appConfig.coupons.payoutEnabled) return;

    const { clientId, clientSecret } = appConfig.cashfree;
    if (!clientId || !clientSecret) {
      logger.warn('Cashfree payout skipped: missing configuration');
      return;
    }

    const existingInitiated = (
      await this.payoutAttemptDAO.findByRedemptionId(redemptionId)
    ).find((a) => a.status === 'initiated' && a.transfer_id);

    if (existingInitiated?.transfer_id) {
      await this.reconcileTransfer(existingInitiated);
      return;
    }

    const attempt = await this.acquirePayoutAttempt(redemptionId);
    if (!attempt) return;

    await this.executeCashfreeTransfer(redemptionId, attempt);
  }

  /**
   * CMS / admin: start or reconcile Cashfree payout for a pending redemption.
   * Returns current redemption + latest attempt after processing (for UI).
   */
  async initiatePayout(redemptionId: string): Promise<InitiateCashfreePayoutResult> {
    if (!appConfig.coupons.payoutEnabled) {
      throw new BadRequestError('Cashfree payout is disabled (COUPON_PAYOUT_ENABLED)');
    }
    const { clientId, clientSecret } = appConfig.cashfree;
    if (!clientId || !clientSecret) {
      throw new BadRequestError('Cashfree is not configured');
    }

    const redemption = await this.redemptionDAO.findById(redemptionId);
    if (!redemption) throw new BadRequestError('Redemption not found');
    if (redemption.payout_status === 'paid') {
      throw new BadRequestError('Redemption is already paid');
    }

    if (!this.hasBankDetails(redemption)) {
      throw new BadRequestError('Bank account details are required for Cashfree payout');
    }

    const initiated = (await this.payoutAttemptDAO.findByRedemptionId(redemptionId)).find(
      (a) => a.status === 'initiated'
    );
    if (initiated) {
      await this.reconcileTransfer(initiated);
    } else {
      await this.processRedemption(redemptionId);
    }

    return this.buildInitiateResult(redemptionId);
  }

  async retryPayout(redemptionId: string): Promise<InitiateCashfreePayoutResult> {
    return this.initiatePayout(redemptionId);
  }

  private async buildInitiateResult(redemptionId: string): Promise<InitiateCashfreePayoutResult> {
    const redemption = await this.redemptionDAO.findById(redemptionId);
    if (!redemption) throw new BadRequestError('Redemption not found');

    const attempts = await this.payoutAttemptDAO.findByRedemptionId(redemptionId);
    const attempt = attempts.length > 0 ? attempts[attempts.length - 1] : null;

    let message = 'Payout initiated with Cashfree';
    if (redemption.payout_status === 'paid') {
      message = 'Payout completed';
    } else if (attempt?.status === 'failed') {
      message = attempt.failure_reason || redemption.last_payout_error || 'Payout failed';
    } else if (attempt?.status === 'initiated') {
      message = 'Payout initiated with Cashfree; awaiting confirmation';
    } else if (!attempt) {
      message =
        redemption.last_payout_error ||
        'No payout attempt created; check bank details and Cashfree configuration';
    }

    return {
      redemptionId: redemption.redemption_id,
      payout_status: redemption.payout_status,
      paid_via: redemption.paid_via,
      paid_at: redemption.paid_at ? new Date(redemption.paid_at).toISOString() : null,
      payment_reference: redemption.payment_reference,
      last_payout_error: redemption.last_payout_error,
      attempt: attempt
        ? {
            payout_attempt_id: attempt.payout_attempt_id,
            status: attempt.status,
            transfer_id: attempt.transfer_id,
            provider_transfer_id: attempt.provider_transfer_id,
            failure_reason: attempt.failure_reason,
          }
        : null,
      message,
    };
  }

  /**
   * Lock redemption, require bank details, create one initiated attempt with a stable transfer_id.
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
          logger.info('Cashfree payout skipped: attempt already in flight', { redemptionId });
          return null;
        }

        if (!this.hasBankDetails(redemption)) {
          await this.redemptionDAO.setLastPayoutError(
            redemptionId,
            'Bank account required for auto payout',
            client
          );
          return null;
        }

        const transferId = this.buildTransferId();
        return this.payoutAttemptDAO.create(
          {
            redemption_id: redemptionId,
            amount_paise: redemption.total_amount_paise,
            status: 'initiated',
            transfer_id: transferId,
          },
          client
        );
      });
    } catch (error) {
      if (error && typeof error === 'object' && (error as { code?: string }).code === '23505') {
        logger.info('Cashfree payout skipped: concurrent attempt detected', { redemptionId });
        return null;
      }
      throw error;
    }
  }

  private async executeCashfreeTransfer(
    redemptionId: string,
    attempt: PayoutAttempt
  ): Promise<void> {
    const redemption = await this.redemptionDAO.findById(redemptionId);
    if (!redemption || redemption.payout_status !== 'pending') return;
    if (!attempt.transfer_id) {
      await this.recordPayoutFailure(
        redemptionId,
        attempt.payout_attempt_id,
        'Missing transfer_id on payout attempt'
      );
      return;
    }

    const transferAmount = redemption.total_amount_paise / 100;
    if (transferAmount < 1) {
      await this.recordPayoutFailure(
        redemptionId,
        attempt.payout_attempt_id,
        'Transfer amount must be at least 1.00 INR'
      );
      return;
    }

    const body: Record<string, unknown> = {
      transfer_id: attempt.transfer_id,
      transfer_amount: transferAmount,
      transfer_currency: 'INR',
      transfer_mode: 'imps',
      transfer_remarks: 'Coupon Redemption',
      beneficiary_details: {
        beneficiary_name: this.sanitizeBeneficiaryName(
          redemption.payout_account_holder_name
        ),
        beneficiary_instrument_details: {
          bank_account_number: redemption.payout_account_number,
          bank_ifsc: redemption.payout_ifsc,
        },
      },
    };

    if (appConfig.cashfree.fundsourceId) {
      body.fundsource_id = appConfig.cashfree.fundsourceId;
    }

    try {
      const response = await this.cashfreeFetch('/transfers', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (response.status >= 500) {
        logger.warn('Cashfree create returned 5xx; reconciling by transfer_id', {
          redemptionId,
          transferId: attempt.transfer_id,
          status: response.status,
        });
        await this.reconcileTransfer(attempt);
        return;
      }

      const payload = (await this.safeJson(response)) as CashfreeTransferPayload & {
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        const reason =
          payload.message ??
          payload.error ??
          payload.status_description ??
          `Cashfree payout rejected (${response.status})`;
        await this.recordPayoutFailure(redemptionId, attempt.payout_attempt_id, reason);
        return;
      }

      const kind = this.classifyStatus(payload.status);
      if (kind === 'failure') {
        const reason =
          payload.status_description ??
          payload.status_code ??
          payload.status ??
          'Cashfree payout failed';
        await this.recordPayoutFailure(redemptionId, attempt.payout_attempt_id, reason, {
          provider_transfer_id: payload.cf_transfer_id,
        });
        return;
      }

      if (kind === 'success') {
        await this.markPaid(attempt, payload);
        return;
      }

      if (payload.cf_transfer_id) {
        await this.payoutAttemptDAO.updateStatus(attempt.payout_attempt_id, 'initiated', {
          provider_transfer_id: payload.cf_transfer_id,
        });
      }
    } catch (error) {
      logger.error('Cashfree payout create error; reconciling by transfer_id', {
        redemptionId,
        transferId: attempt.transfer_id,
        error,
      });
      await this.reconcileTransfer(attempt);
    }
  }

  /**
   * GET /transfers?transfer_id=... — used after 5xx/timeout and on worker poll for initiated attempts.
   */
  async reconcileTransfer(attempt: PayoutAttempt): Promise<void> {
    if (!attempt.transfer_id) return;

    const redemption = await this.redemptionDAO.findById(attempt.redemption_id);
    if (!redemption || redemption.payout_status !== 'pending') return;
    if (attempt.status === 'success') return;

    try {
      const response = await this.cashfreeFetch(
        `/transfers?transfer_id=${encodeURIComponent(attempt.transfer_id)}`,
        { method: 'GET' }
      );

      if (response.status === 404) {
        await this.recordPayoutFailure(
          attempt.redemption_id,
          attempt.payout_attempt_id,
          'Cashfree create ambiguous; transfer not found'
        );
        return;
      }

      if (response.status >= 500 || !response.ok) {
        logger.warn('Cashfree get transfer status not conclusive; leaving initiated', {
          transferId: attempt.transfer_id,
          status: response.status,
        });
        return;
      }

      const payload = (await this.safeJson(response)) as CashfreeTransferPayload;
      const kind = this.classifyStatus(payload.status);

      if (kind === 'success') {
        await this.markPaid(attempt, payload);
        return;
      }

      if (kind === 'failure') {
        const reason =
          payload.status_description ??
          payload.status_code ??
          payload.status ??
          'Cashfree payout failed';
        await this.recordPayoutFailure(
          attempt.redemption_id,
          attempt.payout_attempt_id,
          reason,
          { provider_transfer_id: payload.cf_transfer_id }
        );
        return;
      }

      if (payload.cf_transfer_id && !attempt.provider_transfer_id) {
        await this.payoutAttemptDAO.updateStatus(attempt.payout_attempt_id, 'initiated', {
          provider_transfer_id: payload.cf_transfer_id,
        });
      }
    } catch (error) {
      logger.error('Cashfree reconcile error; leaving initiated', {
        transferId: attempt.transfer_id,
        error,
      });
    }
  }

  verifyWebhookSignature(
    rawBody: string,
    signature: string,
    timestamp: string
  ): boolean {
    const secret = appConfig.cashfree.clientSecret;
    if (!secret || !signature || !timestamp) return false;

    const expected = createHmac('sha256', secret)
      .update(timestamp + rawBody)
      .digest('base64');

    const expectedBuf = Buffer.from(expected);
    const signatureBuf = Buffer.from(signature);
    return (
      expectedBuf.length === signatureBuf.length &&
      timingSafeEqual(expectedBuf, signatureBuf)
    );
  }

  async handleWebhook(payload: Record<string, unknown>): Promise<void> {
    const eventType = this.extractEventType(payload);
    const transfer = this.extractTransferData(payload);
    const transferId = transfer.transfer_id ?? null;
    const providerTransferId = transfer.cf_transfer_id ?? null;

    let attempt: PayoutAttempt | null = null;
    if (transferId) {
      attempt = await this.payoutAttemptDAO.findByTransferId(transferId);
    }
    if (!attempt && providerTransferId) {
      attempt = await this.payoutAttemptDAO.findByProviderTransferId(providerTransferId);
    }

    const cashfreeEventId = this.resolveEventId(eventType, payload, transfer);

    const { record, isDuplicate } = await this.webhookEventDAO.insertReceived({
      cashfree_event_id: cashfreeEventId,
      event_type: eventType,
      transfer_id: transferId,
      provider_transfer_id: providerTransferId,
      payout_attempt_id: attempt?.payout_attempt_id ?? null,
      redemption_id: attempt?.redemption_id ?? null,
      payload,
    });

    if (isDuplicate && (record.status === 'processed' || record.status === 'ignored')) {
      return;
    }

    // Non-transfer events (e.g. LOW_BALANCE_ALERT used for webhook URL validation)
    if (!SUCCESS_EVENTS.has(eventType) && !FAILURE_EVENTS.has(eventType)) {
      await this.webhookEventDAO.markOutcome(record.webhook_event_id, {
        status: 'ignored',
        transfer_id: transferId,
        provider_transfer_id: providerTransferId,
      });
      return;
    }

    try {
      const outcome = await this.processTransferWebhook(eventType, transfer, attempt);
      await this.webhookEventDAO.markOutcome(record.webhook_event_id, {
        status: outcome,
        transfer_id: transferId,
        provider_transfer_id: providerTransferId,
        payout_attempt_id: attempt?.payout_attempt_id ?? null,
        redemption_id: attempt?.redemption_id ?? null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Webhook processing failed';
      await this.webhookEventDAO.markOutcome(record.webhook_event_id, {
        status: 'failed',
        transfer_id: transferId,
        provider_transfer_id: providerTransferId,
        payout_attempt_id: attempt?.payout_attempt_id ?? null,
        redemption_id: attempt?.redemption_id ?? null,
        error_message: message,
      });
      throw error;
    }
  }

  private async processTransferWebhook(
    eventType: string,
    transfer: CashfreeTransferPayload,
    attempt: PayoutAttempt | null
  ): Promise<WebhookProcessOutcome> {
    if (!attempt) {
      logger.warn('Cashfree webhook for unknown transfer', {
        transferId: transfer.transfer_id,
        cfTransferId: transfer.cf_transfer_id,
      });
      return 'ignored';
    }

    if (attempt.status === 'success') {
      return 'ignored';
    }

    if (SUCCESS_EVENTS.has(eventType) || this.classifyStatus(transfer.status) === 'success') {
      await this.markPaid(attempt, transfer);
      return 'processed';
    }

    if (FAILURE_EVENTS.has(eventType) || this.classifyStatus(transfer.status) === 'failure') {
      const reason =
        transfer.status_description ??
        transfer.status_code ??
        eventType;
      await this.recordPayoutFailure(
        attempt.redemption_id,
        attempt.payout_attempt_id,
        reason,
        { provider_transfer_id: transfer.cf_transfer_id }
      );
      return 'processed';
    }

    return 'ignored';
  }

  private async markPaid(
    attempt: PayoutAttempt,
    transfer: CashfreeTransferPayload
  ): Promise<void> {
    const paymentReference =
      transfer.transfer_utr ??
      transfer.cf_transfer_id ??
      attempt.transfer_id ??
      attempt.payout_attempt_id;

    await db.transaction(async (client) => {
      await this.payoutAttemptDAO.updateStatus(
        attempt.payout_attempt_id,
        'success',
        { provider_transfer_id: transfer.cf_transfer_id },
        client
      );
      await this.redemptionDAO.markPaid(
        attempt.redemption_id,
        {
          payment_reference: paymentReference,
          paid_via: 'cashfree',
        },
        client
      );
    });
  }

  private async recordPayoutFailure(
    redemptionId: string,
    attemptId: string,
    reason: string,
    extra?: { provider_transfer_id?: string }
  ): Promise<void> {
    await db.transaction(async (client) => {
      await this.payoutAttemptDAO.updateStatus(
        attemptId,
        'failed',
        {
          failure_reason: reason,
          provider_transfer_id: extra?.provider_transfer_id,
        },
        client
      );
      await this.redemptionDAO.setLastPayoutError(redemptionId, reason, client);
    });
  }

  private hasBankDetails(redemption: Redemption): boolean {
    return Boolean(
      redemption.payout_account_number?.trim() &&
        redemption.payout_ifsc?.trim() &&
        redemption.payout_account_holder_name?.trim()
    );
  }

  private buildTransferId(): string {
    // max 40 chars; alphanumeric + underscore
    return `cp_${randomUUID().replace(/-/g, '')}`.slice(0, 40);
  }

  private sanitizeBeneficiaryName(name: string | null): string {
    const cleaned = (name ?? '')
      .replace(/[^A-Za-z\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100);
    return cleaned || 'Coupon Redeemer';
  }

  private classifyStatus(status?: string): TerminalKind {
    const normalized = (status ?? '').toUpperCase();
    if (SUCCESS_STATUSES.has(normalized)) return 'success';
    if (FAILURE_STATUSES.has(normalized)) return 'failure';
    return 'pending';
  }

  private extractEventType(payload: Record<string, unknown>): string {
    const type = payload.type ?? payload.event ?? payload.event_type;
    return typeof type === 'string' ? type.toUpperCase() : 'UNKNOWN';
  }

  private extractTransferData(payload: Record<string, unknown>): CashfreeTransferPayload {
    const data = payload.data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return data as CashfreeTransferPayload;
    }
    return {
      transfer_id: typeof payload.transferId === 'string' ? payload.transferId : undefined,
      cf_transfer_id:
        typeof payload.referenceId === 'string'
          ? String(payload.referenceId)
          : typeof payload.cf_transfer_id === 'string'
            ? payload.cf_transfer_id
            : undefined,
      status: typeof payload.status === 'string' ? payload.status : undefined,
      status_description:
        typeof payload.reason === 'string' ? payload.reason : undefined,
      transfer_utr: typeof payload.utr === 'string' ? payload.utr : undefined,
    };
  }

  private resolveEventId(
    eventType: string,
    payload: Record<string, unknown>,
    transfer: CashfreeTransferPayload
  ): string {
    const topLevelId = payload.event_id ?? payload.id;
    if (typeof topLevelId === 'string' && topLevelId.length > 0) {
      return topLevelId;
    }

    const eventTime = payload.event_time ?? payload.eventTime ?? '';
    const key = [
      eventType,
      transfer.transfer_id ?? '',
      transfer.cf_transfer_id ?? '',
      transfer.status ?? '',
      String(eventTime),
    ].join(':');

    return createHash('sha256').update(key || JSON.stringify(payload)).digest('hex');
  }

  private cashfreeFetch(path: string, init: RequestInit): Promise<Response> {
    const { clientId, clientSecret, apiVersion } = appConfig.cashfree;
    const headers: Record<string, string> = {
      'x-client-id': clientId,
      'x-client-secret': clientSecret,
      'x-api-version': apiVersion,
      Accept: 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    };
    if (init.method && init.method !== 'GET') {
      headers['Content-Type'] = 'application/json';
    }

    return fetch(`${cashfreePayoutBaseUrl()}${path}`, {
      ...init,
      headers,
    });
  }

  private async safeJson(response: Response): Promise<Record<string, unknown>> {
    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { message: text.slice(0, 500) };
    }
  }
}

export const cashfreePayoutService = new CashfreePayoutService();
