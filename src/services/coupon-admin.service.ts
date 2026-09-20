import { CouponDAO } from '../dao/coupon.dao';
import { CouponBatchDAO } from '../dao/coupon-batch.dao';
import { CouponStatusHistoryDAO } from '../dao/coupon-status-history.dao';
import { RedeemerDAO } from '../dao/redeemer.dao';
import { RedemptionDAO } from '../dao/redemption.dao';
import { RuleApplicationDAO } from '../dao/rule-application.dao';
import { PayoutAttemptDAO } from '../dao/payout-attempt.dao';
import { CashfreeWebhookEventDAO } from '../dao/cashfree-webhook-event.dao';
import { RedemptionAttemptDAO } from '../dao/redemption-attempt.dao';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors';
import { db } from '../database/connection';
import { CouponStateMachine } from './coupon-state.machine';
import { COUPON_BATCH_LOCKED_MESSAGE } from './coupon-batch.service';
import type { CouponListFilters, CouponListResult, Redeemer, Redemption } from '../models/coupon.model';
import {
  buildBankDetails,
  buildPayoutDetails,
  normalizePhone,
  parseCouponSerialSequence,
} from '../utils/coupon.helpers';

export class CouponAdminService {
  constructor(
    private couponDAO = new CouponDAO(),
    private batchDAO = new CouponBatchDAO(),
    private historyDAO = new CouponStatusHistoryDAO(),
    private redeemerDAO = new RedeemerDAO(),
    private redemptionDAO = new RedemptionDAO(),
    private ruleApplicationDAO = new RuleApplicationDAO(),
    private payoutAttemptDAO = new PayoutAttemptDAO(),
    private webhookEventDAO = new CashfreeWebhookEventDAO(),
    private redemptionAttemptDAO = new RedemptionAttemptDAO(),
    private stateMachine = new CouponStateMachine()
  ) {}

  private async assertCouponBatchNotLocked(batchId: string, client?: Parameters<CouponBatchDAO['findById']>[1]) {
    const batch = await this.batchDAO.findById(batchId, client);
    if (!batch) throw new NotFoundError('Coupon batch not found');
    if (batch.is_locked) {
      throw new ConflictError(COUPON_BATCH_LOCKED_MESSAGE);
    }
  }

  async getCoupons(filters: CouponListFilters): Promise<CouponListResult> {
    const daoFilters: CouponListFilters & {
      fromSequence?: number;
      toSequence?: number;
    } = { ...filters };

    if (filters.from_serial && filters.to_serial) {
      if (filters.batchId) {
        const batch = await this.batchDAO.findById(filters.batchId);
        if (!batch) throw new NotFoundError('Coupon batch not found');
        const fromSeq = parseCouponSerialSequence(filters.from_serial, batch.batch_code);
        const toSeq = parseCouponSerialSequence(filters.to_serial, batch.batch_code);
        if (fromSeq == null || toSeq == null) {
          throw new ValidationError(
            `Serial numbers must belong to this batch (${batch.batch_code}-NNNNNN)`
          );
        }
        if (fromSeq > toSeq) {
          throw new ValidationError('from_serial must be less than or equal to to_serial');
        }
        daoFilters.fromSequence = fromSeq;
        daoFilters.toSequence = toSeq;
      } else if (
        filters.from_serial.trim().toUpperCase() > filters.to_serial.trim().toUpperCase()
      ) {
        throw new ValidationError('from_serial must be less than or equal to to_serial');
      }
    }

    return this.couponDAO.findAll(daoFilters);
  }

  async getCouponByCode(code: string) {
    const coupon = await this.couponDAO.findByCode(code.toUpperCase());
    if (!coupon) throw new NotFoundError('Coupon not found');
    const history = await this.historyDAO.findByCouponId(coupon.coupon_id);
    return { coupon, history };
  }

  async voidCoupon(code: string, userId?: string) {
    return db.transaction(async (client) => {
      const coupon = await this.couponDAO.findByCodeForUpdate(code.toUpperCase(), client);
      if (!coupon) throw new NotFoundError('Coupon not found');
      await this.assertCouponBatchNotLocked(coupon.coupon_batch_id, client);
      await this.stateMachine.transition(
        coupon,
        'void',
        { changedBy: userId, reason: 'admin void' },
        client
      );
      const updated = await this.couponDAO.findByCode(code.toUpperCase(), client);
      return updated!;
    });
  }

  async markCouponPrinted(code: string, userId?: string) {
    return db.transaction(async (client) => {
      const coupon = await this.couponDAO.findByCodeForUpdate(code.toUpperCase(), client);
      if (!coupon) throw new NotFoundError('Coupon not found');
      await this.assertCouponBatchNotLocked(coupon.coupon_batch_id, client);
      await this.stateMachine.transition(
        coupon,
        'printed',
        { changedBy: userId, reason: 'admin mark printed' },
        client
      );
      const updated = await this.couponDAO.findByCode(code.toUpperCase(), client);
      return updated!;
    });
  }

  async markCouponAllotted(code: string, userId?: string) {
    return db.transaction(async (client) => {
      const coupon = await this.couponDAO.findByCodeForUpdate(code.toUpperCase(), client);
      if (!coupon) throw new NotFoundError('Coupon not found');
      await this.assertCouponBatchNotLocked(coupon.coupon_batch_id, client);
      await this.stateMachine.transition(
        coupon,
        'allotted',
        { changedBy: userId, reason: 'admin mark allotted' },
        client
      );
      const updated = await this.couponDAO.findByCode(code.toUpperCase(), client);
      return updated!;
    });
  }

  async getRedemptions(filters: Parameters<RedemptionDAO['findAll']>[0]) {
    const result = await this.redemptionDAO.findAll(filters);
    return {
      ...result,
      rows: result.rows.map((r) => this.formatRedemptionRow(r)),
    };
  }

  async getPendingPayouts(page = 1, limit = 50) {
    return this.getRedemptions({ payoutStatus: 'pending', page, limit });
  }

  async getRedemptionById(id: string) {
    const redemption = await this.redemptionDAO.findById(id);
    if (!redemption) throw new NotFoundError('Redemption not found');

    const redeemer = await this.redeemerDAO.findById(redemption.redeemer_id);
    const ruleApplications = await this.ruleApplicationDAO.findByRedemptionId(id);
    const payoutAttempts = await this.payoutAttemptDAO.findByRedemptionId(id);
    const webhookEvents = await this.webhookEventDAO.findByRedemptionId(id);

    return {
      redemption: this.formatRedemptionRow(redemption),
      redeemer: redeemer ? this.formatRedeemerRow(redeemer) : null,
      ruleApplications,
      payoutAttempts,
      webhookEvents,
    };
  }

  async getRedeemerByPhone(phone: string) {
    let normalized: string;
    try {
      normalized = normalizePhone(phone);
    } catch {
      throw new NotFoundError('Redeemer not found');
    }
    const redeemer = await this.redeemerDAO.findByPhone(normalized);
    if (!redeemer) throw new NotFoundError('Redeemer not found');
    const redemptions = await this.redemptionDAO.findByRedeemerId(redeemer.redeemer_id);
    return {
      redeemer: this.formatRedeemerRow(redeemer),
      redemptions: redemptions.map((r) => this.formatRedemptionRow(r)),
    };
  }

  async getAllRedeemers(page = 1, limit = 50, search?: string) {
    const result = await this.redeemerDAO.findAll(page, limit, search);
    return {
      ...result,
      rows: result.rows.map((r) => this.formatRedeemerRow(r)),
    };
  }

  async getRedemptionAttempts(filters: {
    code?: string;
    phone?: string;
    ip?: string;
    failureReason?: string;
    search?: string;
    fromDate?: string;
    toDate?: string;
    page?: number;
    limit?: number;
  }) {
    return this.redemptionAttemptDAO.findAll(filters);
  }

  private formatRedeemerRow<T extends Redeemer>(redeemer: T) {
    return {
      ...redeemer,
      bank_details: buildBankDetails({
        account_holder_name: redeemer.account_holder_name,
        bank_name: redeemer.bank_name,
        account_number: redeemer.account_number,
        ifsc: redeemer.ifsc,
      }),
    };
  }

  private formatRedemptionRow<T extends Redemption>(redemption: T) {
    return {
      ...redemption,
      payout_details: buildPayoutDetails({
        upi_vpa: redemption.payout_upi_vpa,
        account_holder_name: redemption.payout_account_holder_name,
        bank_name: redemption.payout_bank_name,
        account_number: redemption.payout_account_number,
        ifsc: redemption.payout_ifsc,
      }),
    };
  }
}

export const couponAdminService = new CouponAdminService();
