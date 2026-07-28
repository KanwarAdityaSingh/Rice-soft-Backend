export const COUPON_STATUSES = [
  'created',
  'printed',
  'allotted',
  'redeemed',
  'expired',
  'void',
] as const;

export type CouponStatus = (typeof COUPON_STATUSES)[number];

export const COUPON_BATCH_STATUSES = ['draft', 'generating', 'ready', 'archived'] as const;

export type CouponBatchStatus = (typeof COUPON_BATCH_STATUSES)[number];

export const REDEMPTION_PAYOUT_STATUSES = ['pending', 'paid'] as const;

export type RedemptionPayoutStatus = (typeof REDEMPTION_PAYOUT_STATUSES)[number];

export const REDEMPTION_PAID_VIA = ['manual', 'cashfree', 'razorpay'] as const;

export type RedemptionPaidVia = (typeof REDEMPTION_PAID_VIA)[number];

/** Charset excludes ambiguous chars: 0/O, 1/I/L */
export const COUPON_CODE_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const COUPON_CODE_LENGTH = 8;

export const COUPON_CODE_GENERATION_CHUNK_SIZE = 500;

/** Batch code day-series width: JUL-2026-2307-001 */
export const COUPON_BATCH_SERIES_PAD = 3;

/** Max batches creatable per IST calendar day */
export const COUPON_BATCH_MAX_SERIES_PER_DAY = 999;

/** Coupon serial sequence width within a batch: {batch_code}-000001 (up to 5 lakh) */
export const COUPON_SERIAL_SEQ_PAD = 6;

/** Only allotted coupons can be redeemed by customers */
export const REDEEMABLE_COUPON_STATUS: CouponStatus = 'allotted';

export const PROMOTION_RULE_TYPES = ['FIRST_TIME', 'REDEMPTION_COUNT', 'BATCH'] as const;

export type PromotionRuleType = (typeof PROMOTION_RULE_TYPES)[number];

export const PAYOUT_ATTEMPT_STATUSES = ['initiated', 'success', 'failed'] as const;

export type PayoutAttemptStatus = (typeof PAYOUT_ATTEMPT_STATUSES)[number];

export const PAYOUT_WEBHOOK_STATUSES = ['received', 'processed', 'ignored', 'failed'] as const;

export type PayoutWebhookStatus = (typeof PAYOUT_WEBHOOK_STATUSES)[number];
