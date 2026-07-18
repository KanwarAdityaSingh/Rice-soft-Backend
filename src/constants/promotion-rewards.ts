/**
 * Promotion rule reward shapes (stored as JSONB on promotion_rules.reward).
 *
 * All monetary outputs resolve to integer paise at redeem time.
 * Legacy rules may omit `type` and use `{ bonusPaise }` only — treated as FIXED.
 */

export const PROMOTION_REWARD_TYPES = [
  'FIXED',
  'PERCENT',
  'MULTIPLIER',
  'PERCENT_CAPPED',
] as const;

export type PromotionRewardType = (typeof PROMOTION_REWARD_TYPES)[number];

/** Flat bonus in paise (current default). */
export interface FixedPromotionReward {
  type: 'FIXED';
  bonusPaise: number;
}

/**
 * Percentage of coupon face value as bonus.
 * `percent`: plain human number — 20 means 20% of face value.
 */
export interface PercentPromotionReward {
  type: 'PERCENT';
  percent: number;
}

/**
 * Total payout multiplier on face value.
 * `times`: 1.5 means customer gets 1.5× face value (bonus = 0.5× face).
 */
export interface MultiplierPromotionReward {
  type: 'MULTIPLIER';
  times: number;
}

/** Percentage of face value with an upper cap in paise. */
export interface PercentCappedPromotionReward {
  type: 'PERCENT_CAPPED';
  percent: number;
  maxBonusPaise: number;
}

export type PromotionRuleReward =
  | FixedPromotionReward
  | PercentPromotionReward
  | MultiplierPromotionReward
  | PercentCappedPromotionReward;

/** Pre-migration / API shorthand — still accepted on create. */
export interface LegacyFixedPromotionReward {
  bonusPaise: number;
  type?: undefined;
}

export type PromotionRuleRewardInput = PromotionRuleReward | LegacyFixedPromotionReward;

/** Resolved bonus for audit — always stored as bonus_paise on rule_applications. */
export interface ComputedPromotionReward {
  bonusPaise: number;
  rewardType: PromotionRewardType;
  detail?: string;
}

/**
 * Future reward types (not implemented):
 * TIERED, BONUS_POOL, FIXED_PLUS_PERCENT, MIN_GUARANTEE
 */
export const FUTURE_PROMOTION_REWARD_TYPES = [
  'TIERED',
  'BONUS_POOL',
  'FIXED_PLUS_PERCENT',
  'MIN_GUARANTEE',
] as const;
