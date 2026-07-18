import { PoolClient } from 'pg';
import { db } from '../database/connection';
import { RuleApplication, AppliedRuleResult } from '../models/coupon.model';
import { appendDateRangeConditions } from '../utils/analytics-date-filter';

export class RuleApplicationDAO {
  async bulkInsert(
    redemptionId: string,
    rules: AppliedRuleResult[],
    client: PoolClient
  ): Promise<void> {
    if (rules.length === 0) return;

    const values: unknown[] = [];
    const placeholders: string[] = [];
    let i = 1;

    for (const rule of rules) {
      placeholders.push(`($${i++}, $${i++}, $${i++}, $${i++})`);
      values.push(redemptionId, rule.promotion_rule_id, rule.rule_name, rule.bonus_paise);
    }

    await client.query(
      `
      INSERT INTO rule_applications (redemption_id, promotion_rule_id, rule_name, bonus_paise)
      VALUES ${placeholders.join(', ')}
      `,
      values
    );
  }

  async findByRedemptionId(redemptionId: string): Promise<RuleApplication[]> {
    const result = await db.query<RuleApplication>(
      `SELECT * FROM rule_applications WHERE redemption_id = $1 ORDER BY created_at ASC`,
      [redemptionId]
    );
    return result.rows;
  }

  async getStatsForAllRules(filters?: { fromDate?: string; toDate?: string }): Promise<
    Array<{
      promotion_rule_id: string;
      name: string;
      rule_type: string;
      is_active: boolean;
      application_count: number;
      total_bonus_paise: number;
      last_applied_at: Date | null;
    }>
  > {
    const raConditions: string[] = ['ra.promotion_rule_id = pr.promotion_rule_id'];
    const values: unknown[] = [];

    appendDateRangeConditions(raConditions, values, 'ra.created_at', filters?.fromDate, filters?.toDate);

    const joinOn = raConditions.join(' AND ');

    const result = await db.query<{
      promotion_rule_id: string;
      name: string;
      rule_type: string;
      is_active: boolean;
      application_count: string;
      total_bonus_paise: string;
      last_applied_at: Date | null;
    }>(
      `
      SELECT
        pr.promotion_rule_id,
        pr.name,
        pr.rule_type,
        pr.is_active,
        COUNT(ra.rule_application_id)::text AS application_count,
        COALESCE(SUM(ra.bonus_paise), 0)::text AS total_bonus_paise,
        MAX(ra.created_at) AS last_applied_at
      FROM promotion_rules pr
      LEFT JOIN rule_applications ra ON ${joinOn}
      GROUP BY pr.promotion_rule_id, pr.name, pr.rule_type, pr.is_active
      ORDER BY total_bonus_paise DESC, application_count DESC, pr.name ASC
      `,
      values
    );

    return result.rows.map((row) => ({
      promotion_rule_id: row.promotion_rule_id,
      name: row.name,
      rule_type: row.rule_type,
      is_active: row.is_active,
      application_count: parseInt(row.application_count, 10),
      total_bonus_paise: parseInt(row.total_bonus_paise, 10),
      last_applied_at: row.last_applied_at,
    }));
  }

  async getStatsByRuleId(
    ruleId: string,
    filters?: { fromDate?: string; toDate?: string }
  ): Promise<{
    application_count: number;
    total_bonus_paise: number;
    average_bonus_paise: number;
    last_applied_at: Date | null;
  }> {
    const conditions = ['promotion_rule_id = $1'];
    const values: unknown[] = [ruleId];

    appendDateRangeConditions(conditions, values, 'created_at', filters?.fromDate, filters?.toDate);

    const result = await db.query<{
      application_count: string;
      total_bonus_paise: string;
      average_bonus_paise: string;
      last_applied_at: Date | null;
    }>(
      `
      SELECT
        COUNT(*)::text AS application_count,
        COALESCE(SUM(bonus_paise), 0)::text AS total_bonus_paise,
        COALESCE(AVG(bonus_paise), 0)::text AS average_bonus_paise,
        MAX(created_at) AS last_applied_at
      FROM rule_applications
      WHERE ${conditions.join(' AND ')}
      `,
      values
    );

    const row = result.rows[0];
    return {
      application_count: parseInt(row?.application_count ?? '0', 10),
      total_bonus_paise: parseInt(row?.total_bonus_paise ?? '0', 10),
      average_bonus_paise: Math.round(parseFloat(row?.average_bonus_paise ?? '0')),
      last_applied_at: row?.last_applied_at ?? null,
    };
  }

  async findRecentByRuleId(
    ruleId: string,
    limit = 10,
    filters?: { fromDate?: string; toDate?: string }
  ): Promise<
    Array<{
      rule_application_id: string;
      redemption_id: string;
      bonus_paise: number;
      created_at: Date;
      public_ref: string;
      code: string;
      total_amount_paise: number;
    }>
  > {
    const conditions = ['ra.promotion_rule_id = $1'];
    const values: unknown[] = [ruleId];

    appendDateRangeConditions(conditions, values, 'ra.created_at', filters?.fromDate, filters?.toDate);

    values.push(limit);
    const result = await db.query<{
      rule_application_id: string;
      redemption_id: string;
      bonus_paise: number;
      created_at: Date;
      public_ref: string;
      code: string;
      total_amount_paise: number;
    }>(
      `
      SELECT
        ra.rule_application_id,
        ra.redemption_id,
        ra.bonus_paise,
        ra.created_at,
        r.public_ref,
        r.code,
        r.total_amount_paise
      FROM rule_applications ra
      JOIN redemptions r ON r.redemption_id = ra.redemption_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY ra.created_at DESC
      LIMIT $${values.length}
      `,
      values
    );
    return result.rows;
  }
}
