import Joi from 'joi';
import { COUPON_STATUSES, PROMOTION_RULE_TYPES } from '../constants/coupon-status';
import { kycVerificationDetailsSchema } from './validators';

const promotionRuleRewardSchema = Joi.alternatives()
  .try(
    Joi.object({
      bonusPaise: Joi.number().integer().min(1).required(),
    }),
    Joi.object({
      type: Joi.string().valid('FIXED').required(),
      bonusPaise: Joi.number().integer().min(1).required(),
    }),
    Joi.object({
      type: Joi.string().valid('PERCENT').required(),
      percent: Joi.number().min(1).max(100).required(),
    }),
    Joi.object({
      type: Joi.string().valid('MULTIPLIER').required(),
      times: Joi.number().min(1.01).max(5).required(),
    }),
    Joi.object({
      type: Joi.string().valid('PERCENT_CAPPED').required(),
      percent: Joi.number().min(1).max(100).required(),
      maxBonusPaise: Joi.number().integer().min(1).required(),
    })
  )
  .messages({
    'alternatives.match': 'reward must be FIXED, PERCENT, MULTIPLIER, or PERCENT_CAPPED',
  });

const phoneSchema = Joi.string()
  .required()
  .custom((value, helpers) => {
    const digits = value.replace(/\D/g, '');
    if ((digits.startsWith('91') && digits.length === 12) || digits.length === 10) {
      return value;
    }
    return helpers.error('any.invalid');
  }, 'Indian phone validation');

const couponCodeSchema = Joi.string().trim().uppercase().length(8).pattern(/^[A-Z0-9]{8}$/);

/** YYYY-MM-DD date-range query param — keep as string; Joi.date() breaks inclusive end-of-day filtering. */
export const analyticsDateQuerySchema = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

export const createCouponBatchSchema = Joi.object({
  description: Joi.string().optional().allow('', null),
  face_value_paise: Joi.number().integer().min(1).required(),
  total_count: Joi.number().integer().min(1).max(500000).required(),
  expires_at: Joi.date().iso().optional().allow(null),
  redeem_base_url: Joi.string().uri().optional().allow('', null),
});

/**
 * Partial mark-allotted selection.
 * Empty / omitted body → all printed coupons (legacy).
 * mode=next_available → next N printed by batch_sequence.
 * mode=serial_range → printed coupons whose serial falls in [from, to].
 */
export const markBatchAllottedSchema = Joi.object({
  mode: Joi.string().valid('next_available', 'serial_range').optional(),
  count: Joi.when('mode', {
    is: 'next_available',
    then: Joi.number().integer().min(1).max(500000).required(),
    otherwise: Joi.forbidden(),
  }),
  from_serial: Joi.when('mode', {
    is: 'serial_range',
    then: Joi.string().trim().required().max(64),
    otherwise: Joi.forbidden(),
  }),
  to_serial: Joi.when('mode', {
    is: 'serial_range',
    then: Joi.string().trim().required().max(64),
    otherwise: Joi.forbidden(),
  }),
})
  .optional()
  .default({});

export const verifyCouponSchema = Joi.object({
  code: couponCodeSchema.required(),
});

export const verifyCouponBankAccountSchema = Joi.object({
  account_number: Joi.string().required().min(9).max(18),
  ifsc_code: Joi.string().required().length(11),
});

export const redeemCouponSchema = Joi.object({
  code: couponCodeSchema.required(),
  name: Joi.string().required().max(255),
  phone: phoneSchema.optional(), // Optional - will use authenticated phone from JWT
  upi_vpa: Joi.string().optional().max(255),
  account_holder_name: Joi.string().optional().max(255),
  account_number: Joi.string().optional().min(9).max(50),
  ifsc: Joi.string().optional().length(11),
  bank_name: Joi.string().optional().max(255),
  kyc_verification_details: kycVerificationDetailsSchema,
  idempotency_key: Joi.string().required().max(64),
})
  .or('upi_vpa', 'account_number')
  .messages({
    'object.missing': 'Either upi_vpa or account_number is required',
  })
  .custom((value, helpers) => {
    if (value.account_number) {
      // kyc_verification_details optional when redeemer already has verified bank matching these fields
      // (CouponRedeemService reuses stored KYC). New/changed bank still needs verifyBankAccount snapshot.
      if (!value.account_holder_name?.trim()) {
        return helpers.message({ custom: 'account_holder_name is required for bank payout' });
      }
      if (!value.ifsc?.trim()) {
        return helpers.message({ custom: 'ifsc is required for bank payout' });
      }
    }
    return value;
  });

export const markRedemptionPaidSchema = Joi.object({
  payment_reference: Joi.string().required().max(255),
  notes: Joi.string().optional().allow('', null),
});

export const bulkMarkRedemptionsPaidSchema = Joi.object({
  items: Joi.array()
    .items(
      Joi.object({
        redemption_id: Joi.string().uuid().required(),
        payment_reference: Joi.string().required().max(255),
      })
    )
    .min(1)
    .max(100)
    .required(),
  notes: Joi.string().optional().allow('', null),
});

export const unmarkRedemptionPaidSchema = Joi.object({
  reason: Joi.string().required().max(500),
});

export const redemptionAttemptListQuerySchema = Joi.object({
  code: Joi.string().optional(),
  phone: Joi.string().optional(),
  ip: Joi.string().optional(),
  failureReason: Joi.string().optional(),
  fromDate: analyticsDateQuerySchema,
  toDate: analyticsDateQuerySchema,
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(200).optional(),
});

export const previewPromotionRuleStackSchema = Joi.object({
  phone: Joi.string().optional(),
  total_redemptions: Joi.number().integer().min(0).optional(),
  coupon_batch_id: Joi.string().uuid().required(),
  face_value_paise: Joi.number().integer().min(1).optional(),
  include_inactive: Joi.boolean().optional(),
  include_skipped: Joi.boolean().optional(),
});

export const promotionRuleStatsQuerySchema = Joi.object({
  fromDate: analyticsDateQuerySchema,
  toDate: analyticsDateQuerySchema,
  recentLimit: Joi.number().integer().min(1).max(50).optional(),
});

export const batchPerformanceQuerySchema = Joi.object({
  batchId: Joi.string().uuid().optional(),
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(200).optional(),
});

export const createPromotionRuleSchema = Joi.object({
  name: Joi.string().required().max(255),
  description: Joi.string().optional().allow('', null),
  rule_type: Joi.string()
    .valid(...PROMOTION_RULE_TYPES)
    .required(),
  conditions: Joi.object().required(),
  reward: promotionRuleRewardSchema.required(),
  is_active: Joi.boolean().optional(),
  priority: Joi.number().integer().min(0).optional(),
  valid_from: Joi.date().iso().optional().allow(null),
  valid_to: Joi.date().iso().optional().allow(null),
});

export const updatePromotionRuleSchema = Joi.object({
  name: Joi.string().optional().max(255),
  description: Joi.string().optional().allow('', null),
  rule_type: Joi.string()
    .valid(...PROMOTION_RULE_TYPES)
    .optional(),
  conditions: Joi.object().optional(),
  reward: promotionRuleRewardSchema.optional(),
  is_active: Joi.boolean().optional(),
  priority: Joi.number().integer().min(0).optional(),
  valid_from: Joi.date().iso().optional().allow(null),
  valid_to: Joi.date().iso().optional().allow(null),
});

export const togglePromotionRuleSchema = Joi.object({
  is_active: Joi.boolean().required(),
});

export const sendOtpSchema = Joi.object({
  phone: phoneSchema,
});

export const verifyOtpSchema = Joi.object({
  phone: phoneSchema,
  otp: Joi.string().length(6).pattern(/^\d{6}$/).required(),
});

export const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required().min(20),
});

export const couponListQuerySchema = Joi.object({
  batchId: Joi.string().uuid().optional(),
  status: Joi.string()
    .valid(...COUPON_STATUSES)
    .optional(),
  /** When true, omit void coupons. Ignored if `status` is set (exact status wins). */
  excludeVoid: Joi.boolean().optional(),
  code: Joi.string().optional(),
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(200).optional(),
});

export const redemptionListQuerySchema = Joi.object({
  payoutStatus: Joi.string().valid('pending', 'paid').optional(),
  batchId: Joi.string().uuid().optional(),
  phone: Joi.string().optional(),
  code: couponCodeSchema.optional(),
  fromDate: analyticsDateQuerySchema,
  toDate: analyticsDateQuerySchema,
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(200).optional(),
});
