import { CreatePromotionRuleDTO, UpdatePromotionRuleDTO } from '../models/coupon.model';
import { PromotionRuleDAO } from '../dao/promotion-rule.dao';
import { RuleApplicationDAO } from '../dao/rule-application.dao';
import { RedeemerDAO } from '../dao/redeemer.dao';
import { CouponBatchDAO } from '../dao/coupon-batch.dao';
import { NotFoundError, ValidationError, BadRequestError } from '../utils/errors';
import { PROMOTION_RULE_TYPES } from '../constants/coupon-status';
import type { PromotionRuleRewardInput } from '../constants/promotion-rewards';
import { validatePromotionReward } from './promotion-reward.calculator';
import { promotionRulesEngine } from './promotion-rules.engine';
import { normalizePhone } from '../utils/coupon.helpers';

export type PreviewPromotionRuleStackInput = {
  phone?: string;
  total_redemptions?: number;
  coupon_batch_id: string;
  face_value_paise?: number;
  include_inactive?: boolean;
  include_skipped?: boolean;
};

export class PromotionRuleService {
  constructor(
    private ruleDAO = new PromotionRuleDAO(),
    private ruleApplicationDAO = new RuleApplicationDAO(),
    private redeemerDAO = new RedeemerDAO(),
    private batchDAO = new CouponBatchDAO()
  ) {}

  async create(data: CreatePromotionRuleDTO) {
    this.validateRule(data.rule_type, data.conditions, data.reward);
    return this.ruleDAO.create(data);
  }

  async getAll(includeInactive = true) {
    return this.ruleDAO.findAll(includeInactive);
  }

  async getById(id: string) {
    const rule = await this.ruleDAO.findById(id);
    if (!rule) throw new NotFoundError('Promotion rule not found');
    return rule;
  }

  async update(id: string, data: UpdatePromotionRuleDTO) {
    const existing = await this.getById(id);
    const ruleType = data.rule_type ?? existing.rule_type;
    const conditions = data.conditions ?? (existing.conditions as Record<string, unknown>);
    const reward = data.reward ?? (existing.reward as PromotionRuleRewardInput);
    this.validateRule(ruleType, conditions, reward);
    const updated = await this.ruleDAO.update(id, data);
    if (!updated) throw new NotFoundError('Promotion rule not found');
    return updated;
  }

  async toggle(id: string, isActive: boolean) {
    const updated = await this.ruleDAO.toggleActive(id, isActive);
    if (!updated) throw new NotFoundError('Promotion rule not found');
    return updated;
  }

  async delete(id: string) {
    const existing = await this.getById(id);
    const applicationCount = await this.ruleDAO.countApplications(id);
    if (applicationCount > 0) {
      throw new BadRequestError(
        `Cannot delete rule that has been applied ${applicationCount} time(s). Deactivate it instead.`
      );
    }
    const deleted = await this.ruleDAO.delete(existing.promotion_rule_id);
    if (!deleted) throw new NotFoundError('Promotion rule not found');
    return { promotionRuleId: id, deleted: true };
  }

  async getPerformance(filters?: { fromDate?: string; toDate?: string }) {
    const rows = await this.ruleApplicationDAO.getStatsForAllRules(filters);
    return {
      rules: rows.map((row) => ({
        promotionRuleId: row.promotion_rule_id,
        name: row.name,
        ruleType: row.rule_type,
        isActive: row.is_active,
        applicationCount: row.application_count,
        totalBonusPaise: row.total_bonus_paise,
        lastAppliedAt: row.last_applied_at,
      })),
    };
  }

  async getStatsById(
    id: string,
    filters?: { fromDate?: string; toDate?: string; recentLimit?: number }
  ) {
    const rule = await this.getById(id);
    const stats = await this.ruleApplicationDAO.getStatsByRuleId(id, filters);
    const recentApplications = await this.ruleApplicationDAO.findRecentByRuleId(
      id,
      filters?.recentLimit ?? 10,
      filters
    );

    return {
      rule: {
        promotionRuleId: rule.promotion_rule_id,
        name: rule.name,
        ruleType: rule.rule_type,
        isActive: rule.is_active,
      },
      stats: {
        applicationCount: stats.application_count,
        totalBonusPaise: stats.total_bonus_paise,
        averageBonusPaise: stats.average_bonus_paise,
        lastAppliedAt: stats.last_applied_at,
      },
      recentApplications: recentApplications.map((row) => ({
        ruleApplicationId: row.rule_application_id,
        redemptionId: row.redemption_id,
        publicRef: row.public_ref,
        code: row.code,
        bonusPaise: row.bonus_paise,
        totalAmountPaise: row.total_amount_paise,
        appliedAt: row.created_at,
      })),
    };
  }

  async previewStack(input: PreviewPromotionRuleStackInput) {
    const batch = await this.batchDAO.findById(input.coupon_batch_id);
    if (!batch) throw new NotFoundError('Coupon batch not found');

    const faceValuePaise = input.face_value_paise ?? batch.face_value_paise;
    if (!Number.isInteger(faceValuePaise) || faceValuePaise < 1) {
      throw new ValidationError('face_value_paise must be a positive integer');
    }

    let totalRedemptions = input.total_redemptions ?? 0;
    let phone: string | undefined;

    if (input.phone) {
      phone = normalizePhone(input.phone);
      const redeemer = await this.redeemerDAO.findByPhone(phone);
      if (redeemer) {
        totalRedemptions = redeemer.total_redemptions;
      }
    } else if (input.total_redemptions === undefined) {
      totalRedemptions = 0;
    }

    return promotionRulesEngine.previewStack(
      { total_redemptions: totalRedemptions },
      input.coupon_batch_id,
      faceValuePaise,
      {
        includeInactive: input.include_inactive,
        includeSkipped: input.include_skipped ?? true,
        phone,
      }
    );
  }

  private validateRule(
    ruleType: string,
    conditions: Record<string, unknown>,
    reward: PromotionRuleRewardInput
  ) {
    if (!PROMOTION_RULE_TYPES.includes(ruleType as any)) {
      throw new ValidationError(`Invalid rule type: ${ruleType}`);
    }

    validatePromotionReward(reward);

    switch (ruleType) {
      case 'FIRST_TIME':
        break;
      case 'REDEMPTION_COUNT': {
        const minCount = Number(conditions.minCount);
        if (!Number.isFinite(minCount) || minCount < 1) {
          throw new ValidationError('conditions.minCount must be >= 1');
        }
        if (conditions.countIncludesCurrent === undefined) {
          throw new ValidationError('conditions.countIncludesCurrent is required');
        }
        break;
      }
      case 'BATCH': {
        if (!Array.isArray(conditions.batchIds) || conditions.batchIds.length === 0) {
          throw new ValidationError('conditions.batchIds must be a non-empty array');
        }
        break;
      }
    }
  }
}

export const promotionRuleService = new PromotionRuleService();
