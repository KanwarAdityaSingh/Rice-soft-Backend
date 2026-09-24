import {
  REPLENISHMENT_DEFAULT_SAFETY_DAYS,
  REPLENISHMENT_DEFAULT_TREND_WINDOW_DAYS,
} from '../constants/replenishment';
import { replenishmentDAO } from '../dao/replenishment.dao';
import { replenishmentPlanDAO } from '../dao/replenishment-plan.dao';
import { db } from '../database/connection';
import type { InventoryLedgerSourceType } from '../models/inventory-ledger.model';
import type {
  CreateReplenishmentPlanDTO,
  ReplenishmentAtpDraft,
  ReplenishmentDemandSauda,
  ReplenishmentPlanDetail,
  ReplenishmentPreviewLine,
  ReplenishmentPreviewRequest,
  ReplenishmentPreviewResponse,
  TruckSizeConfig,
  TruckSizeConfigInput,
} from '../models/replenishment.model';
import { getFulfillmentForSaudas } from './sales-sauda-fulfillment';
import { godownService } from './godown.service';
import {
  computeSkuRows,
  fillTruck,
  kgToTonnes,
  quantityToKg,
  round3,
  skuKey,
  snapTruck,
  type EngineSkuInput,
} from './replenishment-engine';
import { NotFoundError, ValidationError } from '../utils/errors';
import type { ReplenishmentPlanStatus } from '../constants/replenishment';

function uniqueIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export class ReplenishmentService {
  async listTruckSizes(activeOnly = true): Promise<TruckSizeConfig[]> {
    return replenishmentDAO.listTruckSizes(activeOnly);
  }

  async replaceTruckSizes(sizes: TruckSizeConfigInput[]): Promise<TruckSizeConfig[]> {
    if (sizes.length === 0) {
      throw new ValidationError('At least one truck size is required');
    }
    const tonnes = sizes.map((s) => Number(s.tonnes));
    if (tonnes.some((t) => !Number.isFinite(t) || t <= 0)) {
      throw new ValidationError('Each truck size tonnes must be a positive number');
    }
    const unique = new Set(tonnes.map((t) => round3(t)));
    if (unique.size !== tonnes.length) {
      throw new ValidationError('Truck size tonnes must be unique');
    }
    return replenishmentDAO.replaceTruckSizes(sizes);
  }

  async getStock(godownId: string) {
    const godown = await godownService.assertActive(godownId);
    const rows = await replenishmentDAO.getStock(godownId);
    const fgiKg = round3(rows.reduce((s, r) => s + r.fgi_kg, 0));
    return {
      godown_id: godown.id,
      godown_name: godown.name,
      totals: {
        fgi_kg: fgiKg,
        fgi_tonnes: kgToTonnes(fgiKg),
        sku_count: rows.length,
      },
      items: rows.map((r) => ({
        ...r,
        fgi_tonnes: kgToTonnes(r.fgi_kg),
      })),
    };
  }

  async getLedger(filters: {
    godown_id: string;
    product_id?: string;
    source_type?: InventoryLedgerSourceType;
    from_date?: string;
    to_date?: string;
    limit: number;
    offset: number;
  }) {
    await godownService.assertActive(filters.godown_id);
    return replenishmentDAO.getLedger(filters);
  }

  async preview(input: ReplenishmentPreviewRequest): Promise<ReplenishmentPreviewResponse> {
    const godown = await godownService.assertActive(input.godown_id);
    const trendWindowDays = input.trend_window_days ?? REPLENISHMENT_DEFAULT_TREND_WINDOW_DAYS;
    const safetyDays = input.safety_days ?? REPLENISHMENT_DEFAULT_SAFETY_DAYS;
    if (trendWindowDays < 1) {
      throw new ValidationError('trend_window_days must be at least 1');
    }
    if (safetyDays < 0) {
      throw new ValidationError('safety_days cannot be negative');
    }
    if (input.mode === 'fill_truck') {
      if (input.truck_tonnes == null || !(Number(input.truck_tonnes) > 0)) {
        throw new ValidationError('truck_tonnes is required and must be > 0 when mode is fill_truck');
      }
    }

    const truckConfigs = await replenishmentDAO.listTruckSizes(true);
    const truckSizes = truckConfigs.map((t) => t.tonnes);

    const saudaIds = uniqueIds(input.sales_sauda_ids ?? []);

    const saudaMeta = saudaIds.length > 0 ? await replenishmentDAO.getSalesSaudasMeta(saudaIds) : [];
    if (saudaIds.length > 0) {
      const found = new Set(saudaMeta.map((m) => m.id));
      const missing = saudaIds.filter((id) => !found.has(id));
      if (missing.length > 0) {
        throw new ValidationError(`Sales sauda not found: ${missing.join(', ')}`);
      }
      const transfers = saudaMeta.filter((m) => m.movement_type === 'godown_transfer');
      if (transfers.length > 0) {
        throw new ValidationError(
          'Godown transfer saudas cannot be used as replenishment demand'
        );
      }
    }

    const [stock, drafts, trend] = await Promise.all([
      replenishmentDAO.getStock(godown.id),
      replenishmentDAO.getDraftAllocations(godown.id),
      replenishmentDAO.getTrendSales(godown.id, trendWindowDays),
    ]);

    const demandBySku = new Map<
      string,
      {
        kg: number;
        items: ReplenishmentDemandSauda[];
        product_id: string;
        packaging_id: string;
        holding_capacity: number;
        product_name: string;
      }
    >();
    const partyBySauda = new Map(saudaMeta.map((m) => [m.id, m]));

    if (saudaIds.length > 0) {
      const fulfillment = await getFulfillmentForSaudas(saudaIds);
      const pkgIds = [...fulfillment.values()]
        .flat()
        .map((l) => l.packaging_id)
        .filter((id): id is string => !!id);
      const pkgMeta = await this.loadPackagingMeta(pkgIds);

      for (const [saudaId, lines] of fulfillment) {
        const header = partyBySauda.get(saudaId);
        for (const line of lines) {
          if (line.line_type !== 'product' || !line.product_id || !line.packaging_id) continue;
          const meta = pkgMeta.get(line.packaging_id);
          const cap = meta?.holding_capacity ?? 0;
          const remainingKg = quantityToKg(line.remaining, line.quantity_unit, cap, null);
          const orderedKg = quantityToKg(line.ordered, line.quantity_unit, cap, null);
          const allocatedKg = quantityToKg(line.allocated, line.quantity_unit, cap, null);
          const returnedKg = quantityToKg(line.returned, line.quantity_unit, cap, null);
          const key = skuKey(line.product_id, line.packaging_id);
          const bucket = demandBySku.get(key) ?? {
            kg: 0,
            items: [] as ReplenishmentDemandSauda[],
            product_id: line.product_id,
            packaging_id: line.packaging_id,
            holding_capacity: cap,
            product_name: meta?.product_name ?? '',
          };
          bucket.kg = round3(bucket.kg + remainingKg);
          bucket.items.push({
            sales_sauda_id: saudaId,
            order_number: header?.order_number ?? null,
            party_name: header?.party_name ?? null,
            ordered_kg: orderedKg,
            allocated_kg: allocatedKg,
            returned_kg: returnedKg,
            remaining_kg: remainingKg,
          });
          demandBySku.set(key, bucket);
        }
      }
    }

    const draftsBySku = new Map<string, { kg: number; items: ReplenishmentAtpDraft[] }>();
    for (const d of drafts) {
      const key = skuKey(d.product_id, d.packaging_id);
      const bucket = draftsBySku.get(key) ?? { kg: 0, items: [] as ReplenishmentAtpDraft[] };
      bucket.kg = round3(bucket.kg + d.quantity_kg);
      bucket.items.push({
        invoice_dispatch_id: d.invoice_dispatch_id,
        invoice_dispatch_line_id: d.invoice_dispatch_line_id,
        internal_invoice_number: d.internal_invoice_number,
        serial_number: d.serial_number,
        party_name: d.party_name,
        sales_sauda_id: d.sales_sauda_id,
        order_number: d.order_number,
        quantity_kg: d.quantity_kg,
        packets: d.packets,
        status: 'draft',
      });
      draftsBySku.set(key, bucket);
    }

    const engineInputs = new Map<string, EngineSkuInput>();
    const upsert = (
      productId: string,
      packagingId: string,
      patch: Partial<EngineSkuInput> & { product_name?: string; holding_capacity?: number }
    ) => {
      const key = skuKey(productId, packagingId);
      const existing = engineInputs.get(key) ?? {
        product_id: productId,
        packaging_id: packagingId,
        product_name: patch.product_name || '',
        holding_capacity: patch.holding_capacity ?? 0,
        fgi_kg: 0,
        fgi_packets: 0,
        draft_kg: 0,
        demand_kg: 0,
        trend_sold_kg: 0,
      };
      if (patch.product_name) existing.product_name = patch.product_name;
      if (patch.holding_capacity && patch.holding_capacity > 0) {
        existing.holding_capacity = patch.holding_capacity;
      }
      if (patch.fgi_kg != null) existing.fgi_kg = patch.fgi_kg;
      if (patch.fgi_packets != null) existing.fgi_packets = patch.fgi_packets;
      if (patch.draft_kg != null) existing.draft_kg = patch.draft_kg;
      if (patch.demand_kg != null) existing.demand_kg = patch.demand_kg;
      if (patch.trend_sold_kg != null) existing.trend_sold_kg = patch.trend_sold_kg;
      engineInputs.set(key, existing);
    };

    for (const s of stock) {
      upsert(s.product_id, s.packaging_id, {
        product_name: s.product_name,
        holding_capacity: s.holding_capacity,
        fgi_kg: s.fgi_kg,
        fgi_packets: s.fgi_packets,
      });
    }
    for (const d of drafts) {
      upsert(d.product_id, d.packaging_id, {
        product_name: d.product_name,
        holding_capacity: d.holding_capacity,
        draft_kg: draftsBySku.get(skuKey(d.product_id, d.packaging_id))?.kg ?? d.quantity_kg,
      });
    }
    for (const d of demandBySku.values()) {
      upsert(d.product_id, d.packaging_id, {
        demand_kg: d.kg,
        holding_capacity: d.holding_capacity,
        product_name: d.product_name,
      });
    }
    for (const t of trend) {
      upsert(t.product_id, t.packaging_id, {
        product_name: t.product_name,
        holding_capacity: t.holding_capacity,
        trend_sold_kg: t.sold_kg,
      });
    }

    const computed = computeSkuRows(
      [...engineInputs.values()].filter(
        (r) => r.holding_capacity > 0 && r.product_id && r.packaging_id
      ),
      trendWindowDays,
      safetyDays
    );
    computed.sort(
      (a, b) =>
        a.product_name.localeCompare(b.product_name) || a.holding_capacity - b.holding_capacity
    );

    const fill =
      input.mode === 'fill_truck' || (input.truck_tonnes != null && Number(input.truck_tonnes) > 0)
        ? fillTruck(computed, Number(input.truck_tonnes))
        : null;

    const lines: ReplenishmentPreviewLine[] = computed.map((row) => {
      const key = skuKey(row.product_id, row.packaging_id);
      const fillRow = fill?.by_sku.get(key) ?? null;
      return {
        product_id: row.product_id,
        product_name: row.product_name,
        packaging_id: row.packaging_id,
        holding_capacity: row.holding_capacity,
        fgi_kg: row.fgi_kg,
        fgi_packets: row.fgi_packets,
        draft_kg: row.draft_kg,
        available_kg: row.available_kg,
        available_packets: row.available_packets,
        demand_kg: row.demand_kg,
        demand_packets: row.demand_packets,
        gap_kg: row.gap_kg,
        gap_packets: row.gap_packets,
        surplus_kg: row.surplus_kg,
        trend_sold_kg: row.trend_sold_kg,
        daily_kg: row.daily_kg,
        safety_kg: row.safety_kg,
        safety_packets: row.safety_packets,
        trend_share: row.trend_share,
        load_orders_kg: row.load_orders_kg,
        load_orders_packets: row.load_orders_packets,
        load_orders_tonnes: kgToTonnes(row.load_orders_kg),
        load_with_safety_kg: row.load_with_safety_kg,
        load_with_safety_packets: row.load_with_safety_packets,
        load_with_safety_tonnes: kgToTonnes(row.load_with_safety_kg),
        for_orders_kg: fillRow?.for_orders_kg ?? null,
        for_orders_packets: fillRow?.for_orders_packets ?? null,
        for_trend_kg: fillRow?.for_trend_kg ?? null,
        for_trend_packets: fillRow?.for_trend_packets ?? null,
        fill_truck_kg: fillRow?.load_kg ?? null,
        fill_truck_packets: fillRow?.load_packets ?? null,
        fill_truck_tonnes: fillRow?.load_tonnes ?? null,
        still_short_kg: fillRow?.still_short_kg ?? null,
        still_short_packets: fillRow?.still_short_packets ?? null,
        atp_drafts: draftsBySku.get(key)?.items ?? [],
        demand_saudas: demandBySku.get(key)?.items ?? [],
      };
    });

    const fgiKg = round3(computed.reduce((s, r) => s + r.fgi_kg, 0));
    const draftKg = round3(computed.reduce((s, r) => s + r.draft_kg, 0));
    const availableKg = round3(computed.reduce((s, r) => s + r.available_kg, 0));
    const demandKg = round3(computed.reduce((s, r) => s + r.demand_kg, 0));
    const gapKg = round3(computed.reduce((s, r) => s + r.gap_kg, 0));
    const surplusKg = round3(computed.reduce((s, r) => s + r.surplus_kg, 0));
    const tonnesOrders = kgToTonnes(computed.reduce((s, r) => s + r.load_orders_kg, 0));
    const tonnesSafety = kgToTonnes(computed.reduce((s, r) => s + r.load_with_safety_kg, 0));

    return {
      godown_id: godown.id,
      godown_name: godown.name,
      sauda_ids: saudaIds,
      defaults: {
        trend_window_days: trendWindowDays,
        safety_days: safetyDays,
      },
      totals: {
        fgi_kg: fgiKg,
        draft_kg: draftKg,
        available_kg: availableKg,
        demand_kg: demandKg,
        gap_kg: gapKg,
        surplus_kg: surplusKg,
        tonnes_for_orders: tonnesOrders,
        tonnes_for_orders_plus_safety: tonnesSafety,
        truck_snap_orders: snapTruck(tonnesOrders, truckSizes),
        truck_snap_with_safety: snapTruck(tonnesSafety, truckSizes),
      },
      truck_sizes: truckSizes,
      fill_truck: fill
        ? {
            truck_tonnes: fill.truck_tonnes,
            capacity_kg: fill.capacity_kg,
            allocated_kg: fill.allocated_kg,
            unallocated_kg: fill.unallocated_kg,
            still_short_kg: fill.still_short_kg,
          }
        : null,
      lines,
    };
  }

  async createPlan(
    input: CreateReplenishmentPlanDTO,
    createdBy: string | null
  ): Promise<ReplenishmentPlanDetail> {
    const preview = await this.preview(input);
    return replenishmentPlanDAO.create({
      godown_id: input.godown_id,
      status: 'draft',
      mode: input.mode,
      truck_tonnes_input: input.truck_tonnes ?? null,
      tonnes_for_orders: preview.totals.tonnes_for_orders,
      tonnes_for_orders_plus_safety: preview.totals.tonnes_for_orders_plus_safety,
      snapped_truck_tonnes_orders: preview.totals.truck_snap_orders.snap_up_tonnes,
      snapped_truck_tonnes_with_safety: preview.totals.truck_snap_with_safety.snap_up_tonnes,
      trend_window_days: preview.defaults.trend_window_days,
      safety_days: preview.defaults.safety_days,
      notes: input.notes ?? null,
      preview,
      sauda_ids: preview.sauda_ids,
      lines: preview.lines,
      created_by: createdBy,
    });
  }

  async listPlans(filters: {
    godown_id?: string;
    status?: ReplenishmentPlanStatus;
    limit: number;
    offset: number;
  }) {
    if (filters.godown_id) {
      await godownService.assertActive(filters.godown_id);
    }
    return replenishmentPlanDAO.findAll(filters);
  }

  async getPlan(id: string): Promise<ReplenishmentPlanDetail> {
    const plan = await replenishmentPlanDAO.findById(id);
    if (!plan) throw new NotFoundError('Replenishment plan not found');
    return plan;
  }

  async commitPlan(id: string, actorId: string | null): Promise<ReplenishmentPlanDetail> {
    const existing = await this.getPlan(id);
    if (existing.plan.status !== 'draft') {
      throw new ValidationError(`Cannot commit a plan in status ${existing.plan.status}`);
    }
    await replenishmentPlanDAO.updateStatus(id, 'committed', actorId);
    return this.getPlan(id);
  }

  async cancelPlan(id: string): Promise<ReplenishmentPlanDetail> {
    const existing = await this.getPlan(id);
    if (existing.plan.status === 'cancelled') {
      throw new ValidationError('Plan is already cancelled');
    }
    await replenishmentPlanDAO.updateStatus(id, 'cancelled', null);
    return this.getPlan(id);
  }

  private async loadPackagingMeta(
    packagingIds: string[]
  ): Promise<Map<string, { holding_capacity: number; product_name: string; product_id: string }>> {
    const ids = uniqueIds(packagingIds);
    const map = new Map<string, { holding_capacity: number; product_name: string; product_id: string }>();
    if (ids.length === 0) return map;
    const result = await db.query<{
      id: string;
      product_id: string;
      product_name: string;
      holding_capacity: string | number;
    }>(
      `SELECT pkg.id, pkg.product_id, COALESCE(p.name, '') AS product_name, pkg.holding_capacity
       FROM packaging pkg
       INNER JOIN products p ON p.id = pkg.product_id
       WHERE pkg.id = ANY($1::uuid[])`,
      [ids]
    );
    for (const row of result.rows) {
      map.set(row.id, {
        holding_capacity: Number(row.holding_capacity),
        product_name: row.product_name,
        product_id: row.product_id,
      });
    }
    return map;
  }
}

export const replenishmentService = new ReplenishmentService();
