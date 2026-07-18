import { CouponDAO } from '../dao/coupon.dao';
import { RedemptionAttemptDAO } from '../dao/redemption-attempt.dao';
import { REDEEMABLE_COUPON_STATUS } from '../constants/coupon-status';
import { isValidCouponCodeFormat, normalizeCouponCode } from '../utils/coupon.helpers';

export type VerifyCouponResult =
  | { valid: true; faceValuePaise: number; faceValueRupees: number; currency: 'INR' }
  | { valid: false; message: string; reason: string };

export class CouponVerifyService {
  constructor(
    private couponDAO = new CouponDAO(),
    private attemptDAO = new RedemptionAttemptDAO()
  ) {}

  async verify(code: string, context?: { ip?: string; phone?: string }): Promise<VerifyCouponResult> {
    const normalized = normalizeCouponCode(code);

    if (!isValidCouponCodeFormat(normalized)) {
      await this.logFailure(normalized, context, 'invalid_format');
      return { valid: false, message: 'This coupon is not valid', reason: 'invalid_format' };
    }

    const coupon = await this.couponDAO.findByCode(normalized);
    if (!coupon) {
      await this.logFailure(normalized, context, 'not_found');
      return { valid: false, message: 'This coupon is not valid', reason: 'not_found' };
    }

    if (coupon.status === 'redeemed') {
      await this.logFailure(normalized, context, 'already_redeemed');
      return {
        valid: false,
        message: 'This coupon has already been used',
        reason: 'already_redeemed',
      };
    }

    if (coupon.status === 'expired') {
      await this.logFailure(normalized, context, 'expired');
      return { valid: false, message: 'This coupon has expired', reason: 'expired' };
    }

    if (coupon.status === 'void') {
      await this.logFailure(normalized, context, 'void');
      return { valid: false, message: 'This coupon is not valid', reason: 'void' };
    }

    if (coupon.status !== REDEEMABLE_COUPON_STATUS) {
      await this.logFailure(normalized, context, 'not_allotted');
      return { valid: false, message: 'This coupon is not valid', reason: 'not_allotted' };
    }

    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      await this.logFailure(normalized, context, 'expired');
      return { valid: false, message: 'This coupon has expired', reason: 'expired' };
    }

    return {
      valid: true,
      faceValuePaise: coupon.face_value_paise,
      faceValueRupees: coupon.face_value_paise / 100,
      currency: 'INR',
    };
  }

  private async logFailure(
    code: string,
    context: { ip?: string; phone?: string } | undefined,
    reason: string
  ) {
    await this.attemptDAO.insert({
      code_attempted: code,
      phone: context?.phone ?? null,
      ip: context?.ip ?? null,
      failure_reason: reason,
    });
  }
}

export const couponVerifyService = new CouponVerifyService();
