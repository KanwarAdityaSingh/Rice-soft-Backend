import { PoolClient } from 'pg';
import { db } from '../database/connection';
import type { ReplenishmentMode, ReplenishmentPlanStatus } from '../constants/replenishment';
import type {
  ReplenishmentAtpDraft,
  ReplenishmentDemandSauda,
  ReplenishmentPlanDetail,
  ReplenishmentPlanLineRecord,
  ReplenishmentPlanRecord,
  ReplenishmentPreviewLine,
  ReplenishmentPreviewResponse,
} from '../models/replenishment.model';

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === 'number' ? v : parseFloat(v);
}

function toNumOrNull(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  return toNum(v);
}

function parseJsonb<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  }
  return v as T;
}

const PLAN_COLUMNS = `
  id, godown_id, status, mode, truck_tonnes_input,
  tonnes_for_orders, tonnes_for_orders_plus_safety,
  snapped_truck_tonnes_orders, snapped_truck_tonnes_with_safety,
  trend_window_days, safety_days, notes, preview_json,
  created_at, updated_at, created_by, committed_at, committed_by
`;

function mapPlan(row: Record<string, unknown>): ReplenishmentPlanRecord {
  return {
    id: row.id as string,
    godown_id: row.godown_id as string,
    status: row.status as ReplenishmentPlanStatus,
    mode: row.mode as ReplenishmentMode,
    truck_tonnes_input: toNumOrNull(row.truck_tonnes_input as string | number | null),
    tonnes_for_orders: toNum(row.tonnes_for_orders as string | number),
    tonnes_for_orders_plus_safety: toNum(row.tonnes_for_orders_plus_safety as string | number),
    snapped_truck_tonnes_orders: toNumOrNull(
      row.snapped_truck_tonnes_orders as string | number | null
    ),
    snapped_truck_tonnes_with_safety: toNumOrNull(
      row.snapped_truck_tonnes_with_safety as string | number | null
    ),
    trend_window_days: Number(row.trend_window_days),
    safety_days: Number(row.safety_days),
    notes: (row.notes as string | null) ?? null,
    preview_json: parseJsonb<ReplenishmentPreviewResponse | null>(row.preview_json, null),
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
    created_by: (row.created_by as string | null) ?? null,
    committed_at: (row.committed_at as Date | null) ?? null,
    committed_by: (row.committed_by as string | null) ?? null,
  };
}

function mapLine(row: Record<string, unknown>): ReplenishmentPlanLineRecord {
  return {
    id: row.id as string,
    plan_id: row.plan_id as string,
    product_id: row.product_id as string,
    packaging_id: row.packaging_id as string,
    holding_capacity: toNum(row.holding_capacity as string | number),
    fgi_kg: toNum(row.fgi_kg as string | number),
    draft_kg: toNum(row.draft_kg as string | number),
    available_kg: toNum(row.available_kg as string | number),
    demand_kg: toNum(row.demand_kg as string | number),
    gap_kg: toNum(row.gap_kg as string | number),
    surplus_kg: toNum(row.surplus_kg as string | number),
    trend_sold_kg: toNum(row.trend_sold_kg as string | number),
    daily_kg: toNum(row.daily_kg as string | number),
    safety_kg: toNum(row.safety_kg as string | number),
    trend_share: toNum(row.trend_share as string | number),
    recommended_kg_orders: toNum(row.recommended_kg_orders as string | number),
    recommended_packets_orders: Number(row.recommended_packets_orders),
    recommended_kg_with_safety: toNum(row.recommended_kg_with_safety as string | number),
    recommended_packets_with_safety: Number(row.recommended_packets_with_safety),
    fill_truck_kg: toNumOrNull(row.fill_truck_kg as string | number | null),
    fill_truck_packets:
      row.fill_truck_packets == null ? null : Number(row.fill_truck_packets),
    still_short_kg: toNumOrNull(row.still_short_kg as string | number | null),
    atp_drafts: parseJsonb<ReplenishmentAtpDraft[]>(row.atp_drafts, []),
    demand_saudas: parseJsonb<ReplenishmentDemandSauda[]>(row.demand_saudas, []),
  };
}

export class ReplenishmentPlanDAO {
  async findAll(filters: {
    godown_id?: string;
    status?: ReplenishmentPlanStatus;
    limit: number;
    offset: number;
  }): Promise<{ rows: ReplenishmentPlanRecord[]; total: number }> {
    let where = ' WHERE 1=1';
    const params: unknown[] = [];
    let n = 1;
    if (filters.godown_id) {
      where += ` AND godown_id = $${n++}`;
      params.push(filters.godown_id);
    }
    if (filters.status) {
      where += ` AND status = $${n++}`;
      params.push(filters.status);
    }
    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM replenishment_plans${where}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);
    const result = await db.query(
      `SELECT ${PLAN_COLUMNS} FROM replenishment_plans${where}
       ORDER BY created_at DESC
       LIMIT $${n++} OFFSET $${n}`,
      [...params, filters.limit, filters.offset]
    );
    return { rows: result.rows.map((r) => mapPlan(r)), total };
  }

  async findById(id: string): Promise<ReplenishmentPlanDetail | null> {
    const planResult = await db.query(`SELECT ${PLAN_COLUMNS} FROM replenishment_plans WHERE id = $1`, [
      id,
    ]);
    if (planResult.rows.length === 0) return null;
    const plan = mapPlan(planResult.rows[0]);
    const saudas = await db.query<{ sales_sauda_id: string }>(
      `SELECT sales_sauda_id FROM replenishment_plan_saudas WHERE plan_id = $1`,
      [id]
    );
    const lines = await db.query(
      `SELECT id, plan_id, product_id, packaging_id, holding_capacity,
              fgi_kg, draft_kg, available_kg, demand_kg, gap_kg, surplus_kg,
              trend_sold_kg, daily_kg, safety_kg, trend_share,
              recommended_kg_orders, recommended_packets_orders,
              recommended_kg_with_safety, recommended_packets_with_safety,
              fill_truck_kg, fill_truck_packets, still_short_kg,
              atp_drafts, demand_saudas
       FROM replenishment_plan_lines
       WHERE plan_id = $1
       ORDER BY product_id, holding_capacity`,
      [id]
    );
    return {
      plan,
      sauda_ids: saudas.rows.map((r) => r.sales_sauda_id),
      lines: lines.rows.map((r) => mapLine(r)),
      preview: plan.preview_json,
    };
  }

  async create(input: {
    godown_id: string;
    status: ReplenishmentPlanStatus;
    mode: ReplenishmentMode;
    truck_tonnes_input: number | null;
    tonnes_for_orders: number;
    tonnes_for_orders_plus_safety: number;
    snapped_truck_tonnes_orders: number | null;
    snapped_truck_tonnes_with_safety: number | null;
    trend_window_days: number;
    safety_days: number;
    notes: string | null;
    preview: ReplenishmentPreviewResponse;
    sauda_ids: string[];
    lines: ReplenishmentPreviewLine[];
    created_by: string | null;
  }): Promise<ReplenishmentPlanDetail> {
    return db.transaction(async (client) => {
      const planResult = await client.query(
        `INSERT INTO replenishment_plans (
           godown_id, status, mode, truck_tonnes_input,
           tonnes_for_orders, tonnes_for_orders_plus_safety,
           snapped_truck_tonnes_orders, snapped_truck_tonnes_with_safety,
           trend_window_days, safety_days, notes, preview_json, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING ${PLAN_COLUMNS}`,
        [
          input.godown_id,
          input.status,
          input.mode,
          input.truck_tonnes_input,
          input.tonnes_for_orders,
          input.tonnes_for_orders_plus_safety,
          input.snapped_truck_tonnes_orders,
          input.snapped_truck_tonnes_with_safety,
          input.trend_window_days,
          input.safety_days,
          input.notes,
          JSON.stringify(input.preview),
          input.created_by,
        ]
      );
      const plan = mapPlan(planResult.rows[0]);
      for (const saudaId of input.sauda_ids) {
        await client.query(
          `INSERT INTO replenishment_plan_saudas (plan_id, sales_sauda_id) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [plan.id, saudaId]
        );
      }
      for (const line of input.lines) {
        await this.insertLine(client, plan.id, line);
      }
      const created = await this.findByIdWithClient(client, plan.id);
      if (!created) {
        throw new Error('Replenishment plan not found after create');
      }
      return created;
    });
  }

  private async insertLine(
    client: PoolClient,
    planId: string,
    line: ReplenishmentPreviewLine
  ): Promise<void> {
    await client.query(
      `INSERT INTO replenishment_plan_lines (
         plan_id, product_id, packaging_id, holding_capacity,
         fgi_kg, draft_kg, available_kg, demand_kg, gap_kg, surplus_kg,
         trend_sold_kg, daily_kg, safety_kg, trend_share,
         recommended_kg_orders, recommended_packets_orders,
         recommended_kg_with_safety, recommended_packets_with_safety,
         fill_truck_kg, fill_truck_packets, still_short_kg,
         atp_drafts, demand_saudas
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
       )`,
      [
        planId,
        line.product_id,
        line.packaging_id,
        line.holding_capacity,
        line.fgi_kg,
        line.draft_kg,
        line.available_kg,
        line.demand_kg,
        line.gap_kg,
        line.surplus_kg,
        line.trend_sold_kg,
        line.daily_kg,
        line.safety_kg,
        line.trend_share,
        line.load_orders_kg,
        line.load_orders_packets,
        line.load_with_safety_kg,
        line.load_with_safety_packets,
        line.fill_truck_kg ?? null,
        line.fill_truck_packets ?? null,
        line.still_short_kg ?? null,
        JSON.stringify(line.atp_drafts ?? []),
        JSON.stringify(line.demand_saudas ?? []),
      ]
    );
  }

  private async findByIdWithClient(
    client: PoolClient,
    id: string
  ): Promise<ReplenishmentPlanDetail | null> {
    const planResult = await client.query(`SELECT ${PLAN_COLUMNS} FROM replenishment_plans WHERE id = $1`, [
      id,
    ]);
    if (planResult.rows.length === 0) return null;
    const plan = mapPlan(planResult.rows[0]);
    const saudas = await client.query<{ sales_sauda_id: string }>(
      `SELECT sales_sauda_id FROM replenishment_plan_saudas WHERE plan_id = $1`,
      [id]
    );
    const lines = await client.query(
      `SELECT id, plan_id, product_id, packaging_id, holding_capacity,
              fgi_kg, draft_kg, available_kg, demand_kg, gap_kg, surplus_kg,
              trend_sold_kg, daily_kg, safety_kg, trend_share,
              recommended_kg_orders, recommended_packets_orders,
              recommended_kg_with_safety, recommended_packets_with_safety,
              fill_truck_kg, fill_truck_packets, still_short_kg,
              atp_drafts, demand_saudas
       FROM replenishment_plan_lines
       WHERE plan_id = $1
       ORDER BY product_id, holding_capacity`,
      [id]
    );
    return {
      plan,
      sauda_ids: saudas.rows.map((r) => r.sales_sauda_id),
      lines: lines.rows.map((r) => mapLine(r)),
      preview: plan.preview_json,
    };
  }

  async updateStatus(
    id: string,
    status: ReplenishmentPlanStatus,
    actorId: string | null
  ): Promise<ReplenishmentPlanRecord | null> {
    const result =
      status === 'committed'
        ? await db.query(
            `UPDATE replenishment_plans
             SET status = $2, committed_at = CURRENT_TIMESTAMP, committed_by = $3
             WHERE id = $1
             RETURNING ${PLAN_COLUMNS}`,
            [id, status, actorId]
          )
        : await db.query(
            `UPDATE replenishment_plans
             SET status = $2
             WHERE id = $1
             RETURNING ${PLAN_COLUMNS}`,
            [id, status]
          );
    if (result.rows.length === 0) return null;
    return mapPlan(result.rows[0]);
  }
}

export const replenishmentPlanDAO = new ReplenishmentPlanDAO();
