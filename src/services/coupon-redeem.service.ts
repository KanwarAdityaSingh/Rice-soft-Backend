import { db } from '../database/connection';
import { CouponDAO } from '../dao/coupon.dao';
import { RedeemerDAO } from '../dao/redeemer.dao';
import { RedemptionDAO } from '../dao/redemption.dao';
import { RedemptionAttemptDAO } from '../dao/redemption-attempt.dao';
import { RuleApplicationDAO } from '../dao/rule-application.dao';
import { RedeemCouponDTO, Redeemer } from '../models/coupon.model';
import type { EntityKycVerificationDetails } from '../models/kyc-verification.model';
import { BadRequestError, ValidationError } from '../utils/errors';
import { generatePublicRef, normalizeCouponCode, normalizePhone } from '../utils/coupon.helpers';
import { parseEntityKycDetails } from '../utils/kyc-verification';
import { CouponStateMachine } from './coupon-state.machine';
import { CouponVerifyService } from './coupon-verify.service';
import { PromotionRulesEngine } from './promotion-rules.engine';
import { REDEEMABLE_COUPON_STATUS } from '../constants/coupon-status';
import { appConfig } from '../config/app.config';
import { couponPayoutWorker } from '../workers/coupon-payout.worker';
import { couponBankVerifyService } from './coupon-bank-verify.service';
import { bankVerificationSuccessExtras } from '../utils/bank-verification-response';

function accountDigits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

function normText(value: string | null | undefined): string {
  return (value ?? '').trim();
}

/** True when submitted bank identity matches the stored redeemer row (KYC can be reused). */
function submittedBankMatchesStored(
  data: Pick<RedeemCouponDTO, 'account_holder_name' | 'account_number' | 'ifsc'>,
  stored: Redeemer
): boolean {
  return (
    normText(data.account_holder_name) === normText(stored.account_holder_name) &&
    accountDigits(data.account_number) === accountDigits(stored.account_number) &&
    normText(data.ifsc).toUpperCase() === normText(stored.ifsc).toUpperCase()
  );
}

export class CouponRedeemService {
  constructor(
    private couponDAO = new CouponDAO(),
    private redeemerDAO = new RedeemerDAO(),
    private redemptionDAO = new RedemptionDAO(),
    private attemptDAO = new RedemptionAttemptDAO(),
    private ruleApplicationDAO = new RuleApplicationDAO(),
    private stateMachine = new CouponStateMachine(),
    private verifyService = new CouponVerifyService(),
    private rulesEngine = new PromotionRulesEngine()
  ) {}

  async redeem(data: RedeemCouponDTO) {
    const existing = await this.redemptionDAO.findByIdempotencyKey(data.idempotency_key);
    if (existing) {
      return this.buildResponse(existing, []);
    }

    if (!data.upi_vpa && !data.account_number) {
      throw new ValidationError('Either UPI VPA or bank account details are required');
    }

    let phone: string;
    try {
      phone = normalizePhone(data.phone);
    } catch {
      throw new ValidationError('Invalid phone number');
    }

    const code = normalizeCouponCode(data.code);

    const usesBankPayout = Boolean(data.account_number?.trim());

    let resolvedKyc: EntityKycVerificationDetails | undefined = data.kyc_verification_details;
    let bankVerifyResult;
    if (usesBankPayout) {
      if (!resolvedKyc?.bank) {
        const existing = await this.redeemerDAO.findByPhone(phone);
        const storedKyc = parseEntityKycDetails(existing?.kyc_verification_details);
        if (
          existing?.bank_details_verified_at &&
          storedKyc.bank &&
          submittedBankMatchesStored(data, existing)
        ) {
          resolvedKyc = storedKyc;
        }
      }

      bankVerifyResult = couponBankVerifyService.assertBankVerifiedFromSnapshot(
        {
          account_holder_name: data.account_holder_name,
          account_number: data.account_number,
          ifsc: data.ifsc,
        },
        resolvedKyc
      );
    }

    const result = await db.transaction(async (client) => {
      const dupCheck = await this.redemptionDAO.findByIdempotencyKey(data.idempotency_key, client);
      if (dupCheck) return { redemption: dupCheck, appliedRules: [] };

      const coupon = await this.couponDAO.findByCodeForUpdate(code, client);
      if (!coupon) {
        await this.attemptDAO.insert(
          { code_attempted: code, phone, ip: data.redeemed_ip, failure_reason: 'not_found' },
          client
        );
        throw new BadRequestError('This coupon is not valid');
      }

      if (coupon.status === 'redeemed') {
        await this.attemptDAO.insert(
          { code_attempted: code, phone, ip: data.redeemed_ip, failure_reason: 'already_redeemed' },
          client
        );
        throw new BadRequestError('This coupon has already been used');
      }
      if (coupon.status !== REDEEMABLE_COUPON_STATUS) {
        await this.attemptDAO.insert(
          { code_attempted: code, phone, ip: data.redeemed_ip, failure_reason: 'not_allotted' },
          client
        );
        throw new BadRequestError('This coupon is not valid');
      }
      if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
        await this.attemptDAO.insert(
          { code_attempted: code, phone, ip: data.redeemed_ip, failure_reason: 'expired' },
          client
        );
        throw new BadRequestError('This coupon has expired');
      }

      await this.redeemerDAO.upsert(
        {
          phone,
          name: data.name,
          upi_vpa: data.upi_vpa,
          account_holder_name: data.account_holder_name,
          account_number: data.account_number,
          ifsc: data.ifsc,
          bank_name: data.bank_name,
        },
        client
      );

      const redeemer = await this.redeemerDAO.findByPhoneForUpdate(phone, client);
      if (!redeemer) {
        throw new BadRequestError('Failed to resolve redeemer');
      }

      if (usesBankPayout && resolvedKyc) {
        await this.redeemerDAO.markBankDetailsVerified(
          redeemer.redeemer_id,
          resolvedKyc,
          client
        );
      }

      const { bonusPaise, appliedRules } = await this.rulesEngine.evaluate(
        redeemer,
        coupon.coupon_batch_id,
        coupon.face_value_paise,
        client
      );

      const baseAmount = coupon.face_value_paise;
      const totalAmount = baseAmount + bonusPaise;

      const redemption = await this.redemptionDAO.create(
        {
          public_ref: generatePublicRef(),
          coupon_id: coupon.coupon_id,
          redeemer_id: redeemer.redeemer_id,
          coupon_batch_id: coupon.coupon_batch_id,
          code: coupon.code,
          base_amount_paise: baseAmount,
          bonus_amount_paise: bonusPaise,
          total_amount_paise: totalAmount,
          payout_upi_vpa: data.upi_vpa ?? null,
          payout_account_holder_name: data.account_holder_name ?? null,
          payout_account_number: data.account_number ?? null,
          payout_ifsc: data.ifsc ?? null,
          payout_bank_name: data.bank_name ?? null,
          idempotency_key: data.idempotency_key,
          redeemed_ip: data.redeemed_ip ?? null,
          redeemed_user_agent: data.redeemed_user_agent ?? null,
        },
        client
      );

      await this.ruleApplicationDAO.bulkInsert(redemption.redemption_id, appliedRules, client);

      await this.stateMachine.transition(
        coupon,
        'redeemed',
        {
          reason: 'user redemption',
          metadata: { phone, redemption_id: redemption.redemption_id },
          redeemedAt: new Date(),
        },
        client
      );

      await this.redeemerDAO.incrementStats(redeemer.redeemer_id, totalAmount, client);

      return { redemption, appliedRules };
    });

    if (appConfig.coupons.payoutEnabled && appConfig.coupons.payoutAuto) {
      couponPayoutWorker.enqueue(result.redemption.redemption_id);
    }

    return {
      ...this.buildResponse(result.redemption, result.appliedRules),
      ...(bankVerifyResult ? bankVerificationSuccessExtras(bankVerifyResult) : {}),
    };
  }

  async verify(code: string, context?: { ip?: string; phone?: string }) {
    return this.verifyService.verify(code, context);
  }

  private buildResponse(
    redemption: Awaited<ReturnType<RedemptionDAO['create']>>,
    appliedRules: Array<{ rule_name: string; bonus_paise: number }>
  ) {
    return {
      redemptionId: redemption.redemption_id,
      publicRef: redemption.public_ref,
      baseAmountPaise: redemption.base_amount_paise,
      bonusAmountPaise: redemption.bonus_amount_paise,
      totalAmountPaise: redemption.total_amount_paise,
      payoutStatus: redemption.payout_status,
      appliedRules: appliedRules.map((r) => ({
        name: r.rule_name,
        bonusPaise: r.bonus_paise,
      })),
      message: 'Redemption successful',
    };
  }
}

export const couponRedeemService = new CouponRedeemService();
