import type { CouponBatchStatus, CouponStatus, PayoutAttemptStatus, PromotionRuleType, RazorpayWebhookStatus, RedemptionPaidVia, RedemptionPayoutStatus } from '../constants/coupon-status';
import type { PromotionRuleRewardInput } from '../constants/promotion-rewards';
import type { EntityKycVerificationDetails } from './kyc-verification.model';

export interface CouponBatch {
  coupon_batch_id: string;
  name: string;
  description: string | null;
  face_value_paise: number;
  total_count: number;
  generated_count: number;
  expires_at: Date | null;
  status: CouponBatchStatus;
  redeem_base_url: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Coupon {
  coupon_id: string;
  code: string;
  coupon_batch_id: string;
  face_value_paise: number;
  status: CouponStatus;
  expires_at: Date | null;
  redeemed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CouponStatusHistory {
  coupon_status_history_id: string;
  coupon_id: string;
  from_status: CouponStatus | null;
  to_status: CouponStatus;
  changed_by: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

export interface Redeemer {
  redeemer_id: string;
  phone: string;
  name: string | null;
  upi_vpa: string | null;
  account_holder_name: string | null;
  account_number: string | null;
  ifsc: string | null;
  bank_name: string | null;
  kyc_verification_details: EntityKycVerificationDetails | null;
  bank_details_verified_at: Date | null;
  bank_verification_error: string | null;
  total_redemptions: number;
  lifetime_earned_paise: number;
  first_redeemed_at: Date | null;
  last_redeemed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface Redemption {
  redemption_id: string;
  public_ref: string;
  coupon_id: string;
  redeemer_id: string;
  coupon_batch_id: string;
  code: string;
  base_amount_paise: number;
  bonus_amount_paise: number;
  total_amount_paise: number;
  payout_upi_vpa: string | null;
  payout_account_holder_name: string | null;
  payout_account_number: string | null;
  payout_ifsc: string | null;
  payout_bank_name: string | null;
  payout_status: RedemptionPayoutStatus;
  paid_at: Date | null;
  paid_via: RedemptionPaidVia | null;
  payment_reference: string | null;
  last_payout_error: string | null;
  paid_by: string | null;
  idempotency_key: string;
  redeemed_ip: string | null;
  redeemed_user_agent: string | null;
  created_at: Date;
}

export interface RedemptionAttempt {
  redemption_attempt_id: string;
  code_attempted: string | null;
  phone: string | null;
  ip: string | null;
  failure_reason: string;
  created_at: Date;
}

export interface PromotionRule {
  promotion_rule_id: string;
  name: string;
  description: string | null;
  rule_type: PromotionRuleType;
  conditions: Record<string, unknown>;
  reward: PromotionRuleRewardInput;
  is_active: boolean;
  priority: number;
  valid_from: Date | null;
  valid_to: Date | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface RuleApplication {
  rule_application_id: string;
  redemption_id: string;
  promotion_rule_id: string;
  rule_name: string;
  bonus_paise: number;
  created_at: Date;
}

export interface PayoutAttempt {
  payout_attempt_id: string;
  redemption_id: string;
  amount_paise: number;
  status: PayoutAttemptStatus;
  razorpay_payout_id: string | null;
  failure_reason: string | null;
  created_at: Date;
  completed_at: Date | null;
}

export interface RazorpayWebhookEvent {
  webhook_event_id: string;
  razorpay_event_id: string;
  event_type: string;
  razorpay_payout_id: string | null;
  payout_attempt_id: string | null;
  redemption_id: string | null;
  payload: Record<string, unknown>;
  status: RazorpayWebhookStatus;
  error_message: string | null;
  received_at: Date;
  processed_at: Date | null;
}

export interface CreateRazorpayWebhookEventDTO {
  razorpay_event_id: string;
  event_type: string;
  razorpay_payout_id?: string | null;
  payout_attempt_id?: string | null;
  redemption_id?: string | null;
  payload: Record<string, unknown>;
}

export interface CreateCouponBatchDTO {
  name: string;
  description?: string;
  face_value_paise: number;
  total_count: number;
  expires_at?: Date | string | null;
  redeem_base_url?: string;
  created_by?: string;
}

export interface RedeemCouponDTO {
  code: string;
  name: string;
  phone: string;
  upi_vpa?: string;
  account_holder_name?: string;
  account_number?: string;
  ifsc?: string;
  bank_name?: string;
  kyc_verification_details?: EntityKycVerificationDetails;
  idempotency_key: string;
  redeemed_ip?: string;
  redeemed_user_agent?: string;
}

export interface MarkRedemptionPaidDTO {
  payment_reference: string;
  notes?: string;
  paid_by?: string;
}

export interface CreatePromotionRuleDTO {
  name: string;
  description?: string;
  rule_type: PromotionRuleType;
  conditions: Record<string, unknown>;
  reward: PromotionRuleRewardInput;
  is_active?: boolean;
  priority?: number;
  valid_from?: Date | string | null;
  valid_to?: Date | string | null;
  created_by?: string;
}

export interface UpdatePromotionRuleDTO {
  name?: string;
  description?: string | null;
  rule_type?: PromotionRuleType;
  conditions?: Record<string, unknown>;
  reward?: PromotionRuleRewardInput;
  is_active?: boolean;
  priority?: number;
  valid_from?: Date | string | null;
  valid_to?: Date | string | null;
}

export interface CouponBatchStats {
  created: number;
  printed: number;
  allotted: number;
  redeemed: number;
  expired: number;
  void: number;
  redemption_rate: number;
}

export interface AppliedRuleResult {
  promotion_rule_id: string;
  rule_name: string;
  bonus_paise: number;
}

export interface SendOtpRequest {
  phone: string;
}

export interface VerifyOtpRequest {
  phone: string;
  otp: string;
}
