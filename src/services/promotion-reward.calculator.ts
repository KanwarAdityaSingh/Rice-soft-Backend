import {
  ComputedPromotionReward,
  PromotionRewardType,
  PromotionRuleRewardInput,
} from '../constants/promotion-rewards';
import { ValidationError } from '../utils/errors';

function normalizeRewardType(reward: PromotionRuleRewardInput): PromotionRewardType {
  if (!reward.type) {
    if ('bonusPaise' in reward && typeof reward.bonusPaise === 'number') {
      return 'FIXED';
    }
    throw new ValidationError('reward.type is required (or use legacy bonusPaise)');
  }
  return reward.type;
}

/** Read percent as 1–100 (supports legacy percentBps in stored JSON). */
function readPercent(reward: Record<string, unknown>): number {
  if (typeof reward.percent === 'number') {
    return reward.percent;
  }
  if (typeof reward.percentBps === 'number') {
    return reward.percentBps / 100;
  }
  throw new ValidationError('reward.percent is required (1–100, e.g. 20 for 20%)');
}

/** Read multiplier as e.g. 1.5 (supports legacy multiplierBps in stored JSON). */
function readTimes(reward: Record<string, unknown>): number {
  if (typeof reward.times === 'number') {
    return reward.times;
  }
  if (typeof reward.multiplierBps === 'number') {
    return reward.multiplierBps / 10000;
  }
  throw new ValidationError('reward.times is required (e.g. 1.5 for 1.5× face value payout)');
}

function assertPercent(percent: number, field = 'reward.percent') {
  if (!Number.isFinite(percent) || percent < 1 || percent > 100) {
    throw new ValidationError(`${field} must be between 1 and 100 (e.g. 20 for 20%)`);
  }
}

function assertTimes(times: number) {
  if (!Number.isFinite(times) || times <= 1 || times > 5) {
    throw new ValidationError('reward.times must be greater than 1 and at most 5 (e.g. 1.5 or 2)');
  }
}

/**
 * Compute bonus paise from a rule reward and the coupon face value.
 * Result is always a non-negative integer.
 */
export function computePromotionRewardBonus(
  rewardInput: PromotionRuleRewardInput,
  faceValuePaise: number
): ComputedPromotionReward {
  if (!Number.isInteger(faceValuePaise) || faceValuePaise < 1) {
    throw new ValidationError('faceValuePaise must be a positive integer');
  }

  const rewardType = normalizeRewardType(rewardInput);
  const raw = rewardInput as unknown as Record<string, unknown>;

  switch (rewardType) {
    case 'FIXED': {
      const bonusPaise =
        'bonusPaise' in rewardInput && typeof rewardInput.bonusPaise === 'number'
          ? rewardInput.bonusPaise
          : 0;
      if (!Number.isInteger(bonusPaise) || bonusPaise < 1) {
        throw new ValidationError('reward.bonusPaise must be a positive integer');
      }
      return { bonusPaise, rewardType: 'FIXED' };
    }

    case 'PERCENT': {
      const percent = readPercent(raw);
      assertPercent(percent);
      const bonusPaise = Math.floor((faceValuePaise * percent) / 100);
      return {
        bonusPaise,
        rewardType: 'PERCENT',
        detail: `${percent}% of face value`,
      };
    }

    case 'MULTIPLIER': {
      const times = readTimes(raw);
      assertTimes(times);
      const bonusPaise = Math.floor(faceValuePaise * (times - 1));
      return {
        bonusPaise,
        rewardType: 'MULTIPLIER',
        detail: `${times}× face value payout`,
      };
    }

    case 'PERCENT_CAPPED': {
      const percent = readPercent(raw);
      assertPercent(percent);
      const maxBonusPaise = Number(raw.maxBonusPaise);
      if (!Number.isInteger(maxBonusPaise) || maxBonusPaise < 1) {
        throw new ValidationError('reward.maxBonusPaise must be a positive integer (paise)');
      }
      const uncapped = Math.floor((faceValuePaise * percent) / 100);
      const bonusPaise = Math.min(uncapped, maxBonusPaise);
      return {
        bonusPaise,
        rewardType: 'PERCENT_CAPPED',
        detail: `${percent}% capped at ₹${maxBonusPaise / 100}`,
      };
    }

    default:
      throw new ValidationError(`Unsupported reward type: ${rewardType}`);
  }
}

export function validatePromotionReward(rewardInput: PromotionRuleRewardInput): void {
  computePromotionRewardBonus(rewardInput, 10000);
}

export function normalizePromotionRewardForStorage(
  rewardInput: PromotionRuleRewardInput
): PromotionRuleRewardInput {
  if (!rewardInput.type && 'bonusPaise' in rewardInput) {
    return { type: 'FIXED', bonusPaise: rewardInput.bonusPaise };
  }
  return rewardInput;
}
