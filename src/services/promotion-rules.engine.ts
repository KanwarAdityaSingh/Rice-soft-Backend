import { PoolClient } from 'pg';
import { PromotionRule, Redeemer, Redemption, RedeemCouponDTO, AppliedRuleResult } from '../models/coupon.model';
import type { PromotionRuleType } from '../constants/coupon-status';
import type { ComputedPromotionReward } from '../constants/promotion-rewards';
import { PromotionRuleDAO } from '../dao/promotion-rule.dao';
import { computePromotionRewardBonus } from './promotion-reward.calculator';

export type RuleStackPreviewRule = {
  promotionRuleId: string;
  ruleName: string;
  ruleType: PromotionRuleType;
  priority: number;
  bonusPaise: number;
  rewardType: string;
  rewardDetail?: string;
};

export type RuleStackSkippedRule = {
  promotionRuleId: string;
  ruleName: string;
  ruleType: PromotionRuleType;
  priority: number;
  skipReason: string;
};

export type RuleStackPreview = {
  redeemerContext: {
    totalRedemptions: number;
    phone?: string;
  };
  couponBatchId: string;
  faceValuePaise: number;
  baseAmountPaise: number;
  bonusAmountPaise: number;
  totalAmountPaise: number;
  appliedRules: RuleStackPreviewRule[];
  skippedRules: RuleStackSkippedRule[];
};

export class PromotionRulesEngine {
  constructor(private ruleDAO = new PromotionRuleDAO()) {}

  async evaluate(
    redeemer: Redeemer,
    couponBatchId: string,
    faceValuePaise: number,
    client?: PoolClient
  ): Promise<{ bonusPaise: number; appliedRules: AppliedRuleResult[] }> {
    const preview = await this.previewStack(
      { total_redemptions: redeemer.total_redemptions },
      couponBatchId,
      faceValuePaise,
      { client, includeSkipped: false }
    );
    return {
      bonusPaise: preview.bonusAmountPaise,
      appliedRules: preview.appliedRules.map((rule) => ({
        promotion_rule_id: rule.promotionRuleId,
        rule_name: rule.ruleName,
        bonus_paise: rule.bonusPaise,
      })),
    };
  }

  async previewStack(
    redeemer: Pick<Redeemer, 'total_redemptions'>,
    couponBatchId: string,
    faceValuePaise: number,
    opts?: {
      client?: PoolClient;
      includeInactive?: boolean;
      includeSkipped?: boolean;
      phone?: string;
    }
  ): Promise<RuleStackPreview> {
    const rules = opts?.includeInactive
      ? await this.ruleDAO.findAll(true)
      : await this.ruleDAO.findActive(opts?.client);

    const activeRules = opts?.includeInactive ? rules.filter((r) => r.is_active) : rules;
    const appliedRules: RuleStackPreviewRule[] = [];
    const skippedRules: RuleStackSkippedRule[] = [];
    let totalBonus = 0;

    for (const rule of activeRules) {
      const match = this.evaluateRuleMatch(rule, redeemer, couponBatchId, faceValuePaise);
      if (match.matched) {
        totalBonus += match.bonusPaise;
        appliedRules.push({
          promotionRuleId: rule.promotion_rule_id,
          ruleName: rule.name,
          ruleType: rule.rule_type,
          priority: rule.priority,
          bonusPaise: match.bonusPaise,
          rewardType: match.rewardType,
          rewardDetail: match.detail,
        });
      } else if (opts?.includeSkipped !== false) {
        skippedRules.push({
          promotionRuleId: rule.promotion_rule_id,
          ruleName: rule.name,
          ruleType: rule.rule_type,
          priority: rule.priority,
          skipReason: match.skipReason,
        });
      }
    }

    if (opts?.includeInactive) {
      for (const rule of rules.filter((r) => !r.is_active)) {
        skippedRules.push({
          promotionRuleId: rule.promotion_rule_id,
          ruleName: rule.name,
          ruleType: rule.rule_type,
          priority: rule.priority,
          skipReason: 'rule is inactive',
        });
      }
    }

    return {
      redeemerContext: {
        totalRedemptions: redeemer.total_redemptions,
        phone: opts?.phone,
      },
      couponBatchId,
      faceValuePaise,
      baseAmountPaise: faceValuePaise,
      bonusAmountPaise: totalBonus,
      totalAmountPaise: faceValuePaise + totalBonus,
      appliedRules,
      skippedRules,
    };
  }

  private evaluateRuleMatch(
    rule: PromotionRule,
    redeemer: Pick<Redeemer, 'total_redemptions'>,
    couponBatchId: string,
    faceValuePaise: number
  ):
    | ({ matched: true } & ComputedPromotionReward)
    | { matched: false; skipReason: string } {
    const skipReason = this.explainSkip(rule, redeemer, couponBatchId);
    if (skipReason) {
      return { matched: false, skipReason };
    }

    try {
      const computed = computePromotionRewardBonus(rule.reward, faceValuePaise);
      if (computed.bonusPaise <= 0) {
        return { matched: false, skipReason: 'computed bonus is zero' };
      }
      return { matched: true, ...computed };
    } catch (error) {
      return {
        matched: false,
        skipReason: error instanceof Error ? error.message : 'invalid reward configuration',
      };
    }
  }

  private explainSkip(
    rule: PromotionRule,
    redeemer: Pick<Redeemer, 'total_redemptions'>,
    couponBatchId: string
  ): string | null {
    switch (rule.rule_type) {
      case 'FIRST_TIME':
        return redeemer.total_redemptions === 0
          ? null
          : `redeemer already has ${redeemer.total_redemptions} redemption(s)`;

      case 'REDEMPTION_COUNT': {
        const conditions = rule.conditions as Record<string, unknown>;
        const minCount = Number(conditions.minCount);
        const maxCount =
          conditions.maxCount !== undefined && conditions.maxCount !== null
            ? Number(conditions.maxCount)
            : null;
        const countIncludesCurrent = Boolean(conditions.countIncludesCurrent);
        if (!Number.isFinite(minCount) || minCount < 1) {
          return 'invalid REDEMPTION_COUNT conditions';
        }

        const effectiveCount = countIncludesCurrent
          ? redeemer.total_redemptions + 1
          : redeemer.total_redemptions;

        if (effectiveCount < minCount) {
          return `redemption count ${effectiveCount} is below minCount ${minCount}`;
        }
        if (maxCount !== null && effectiveCount > maxCount) {
          return `redemption count ${effectiveCount} is above maxCount ${maxCount}`;
        }
        return null;
      }

      case 'BATCH': {
        const batchIds = (rule.conditions as Record<string, unknown>).batchIds;
        if (!Array.isArray(batchIds) || batchIds.length === 0) {
          return 'invalid BATCH conditions';
        }
        return batchIds.includes(couponBatchId)
          ? null
          : 'coupon batch is not included in rule batchIds';
      }

      default:
        return `unsupported rule type: ${rule.rule_type}`;
    }
  }
}

export const promotionRulesEngine = new PromotionRulesEngine();

export type RedeemResult = {
  redemption: Redemption;
  appliedRules: AppliedRuleResult[];
};

export type { RedeemCouponDTO };
