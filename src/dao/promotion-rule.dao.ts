import { PoolClient } from 'pg';
import { db } from '../database/connection';
import {
  CreatePromotionRuleDTO,
  PromotionRule,
  UpdatePromotionRuleDTO,
} from '../models/coupon.model';

export class PromotionRuleDAO {
  async create(data: CreatePromotionRuleDTO, client?: PoolClient): Promise<PromotionRule> {
    const query = `
      INSERT INTO promotion_rules (
        name, description, rule_type, conditions, reward,
        is_active, priority, valid_from, valid_to, created_by
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
    `;
    const values = [
      data.name,
      data.description ?? null,
      data.rule_type,
      JSON.stringify(data.conditions),
      JSON.stringify(data.reward),
      data.is_active ?? true,
      data.priority ?? 100,
      data.valid_from ?? null,
      data.valid_to ?? null,
      data.created_by ?? null,
    ];
    const result = client
      ? await client.query<PromotionRule>(query, values)
      : await db.query<PromotionRule>(query, values);
    return result.rows[0];
  }

  async findAll(includeInactive = true): Promise<PromotionRule[]> {
    const query = includeInactive
      ? `SELECT * FROM promotion_rules ORDER BY priority ASC, created_at DESC`
      : `SELECT * FROM promotion_rules WHERE is_active = true ORDER BY priority ASC`;
    const result = await db.query<PromotionRule>(query);
    return result.rows;
  }

  async findActive(client?: PoolClient): Promise<PromotionRule[]> {
    const query = `
      SELECT * FROM promotion_rules
      WHERE is_active = true
        AND (valid_from IS NULL OR valid_from <= NOW())
        AND (valid_to IS NULL OR valid_to >= NOW())
      ORDER BY priority ASC
    `;
    const result = client
      ? await client.query<PromotionRule>(query)
      : await db.query<PromotionRule>(query);
    return result.rows;
  }

  async findById(id: string): Promise<PromotionRule | null> {
    const result = await db.query<PromotionRule>(
      `SELECT * FROM promotion_rules WHERE promotion_rule_id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async update(id: string, data: UpdatePromotionRuleDTO): Promise<PromotionRule | null> {
    const fields: string[] = [];
    const values: unknown[] = [id];
    let i = 2;

    if (data.name !== undefined) {
      fields.push(`name = $${i++}`);
      values.push(data.name);
    }
    if (data.description !== undefined) {
      fields.push(`description = $${i++}`);
      values.push(data.description);
    }
    if (data.rule_type !== undefined) {
      fields.push(`rule_type = $${i++}`);
      values.push(data.rule_type);
    }
    if (data.conditions !== undefined) {
      fields.push(`conditions = $${i++}`);
      values.push(JSON.stringify(data.conditions));
    }
    if (data.reward !== undefined) {
      fields.push(`reward = $${i++}`);
      values.push(JSON.stringify(data.reward));
    }
    if (data.is_active !== undefined) {
      fields.push(`is_active = $${i++}`);
      values.push(data.is_active);
    }
    if (data.priority !== undefined) {
      fields.push(`priority = $${i++}`);
      values.push(data.priority);
    }
    if (data.valid_from !== undefined) {
      fields.push(`valid_from = $${i++}`);
      values.push(data.valid_from);
    }
    if (data.valid_to !== undefined) {
      fields.push(`valid_to = $${i++}`);
      values.push(data.valid_to);
    }

    if (fields.length === 0) return this.findById(id);

    const result = await db.query<PromotionRule>(
      `UPDATE promotion_rules SET ${fields.join(', ')} WHERE promotion_rule_id = $1 RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  async toggleActive(id: string, isActive: boolean): Promise<PromotionRule | null> {
    const result = await db.query<PromotionRule>(
      `UPDATE promotion_rules SET is_active = $2 WHERE promotion_rule_id = $1 RETURNING *`,
      [id, isActive]
    );
    return result.rows[0] || null;
  }

  async countApplications(id: string): Promise<number> {
    const result = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM rule_applications WHERE promotion_rule_id = $1`,
      [id]
    );
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.query(
      `DELETE FROM promotion_rules WHERE promotion_rule_id = $1`,
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }
}
