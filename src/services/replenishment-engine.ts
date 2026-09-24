import { KG_PER_TONNE } from '../constants/replenishment';

/** Align with sales-sauda-fulfillment qty epsilon */
export const REPLENISHMENT_QTY_EPSILON = 1e-6;

export function round3(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1000) / 1000;
}

export function kgToTonnes(kg: number): number {
  return round3(kg / KG_PER_TONNE);
}

export function tonnesToKg(tonnes: number): number {
  return round3(tonnes * KG_PER_TONNE);
}

export function skuKey(productId: string, packagingId: string): string {
  return `${productId}::${packagingId}`;
}

export function parseSkuKey(key: string): { product_id: string; packaging_id: string } {
  const idx = key.indexOf('::');
  return { product_id: key.slice(0, idx), packaging_id: key.slice(idx + 2) };
}

/**
 * Convert a sauda/dispatch quantity to kg.
 * Product lines store kg by default; packets × holding_capacity when unit is packets.
 */
export function quantityToKg(
  quantity: number,
  unit: string | null | undefined,
  holdingCapacity: number | null | undefined,
  packetCount: number | null | undefined
): number {
  const qty = Number(quantity) || 0;
  const u = (unit || 'kg').toLowerCase();
  const cap = holdingCapacity != null ? Number(holdingCapacity) : 0;
  if (u === 'packets') {
    if (packetCount != null && cap > 0) {
      return round3(Number(packetCount) * cap);
    }
    if (cap > 0) {
      return round3(qty * cap);
    }
    return 0;
  }
  return round3(qty);
}

export function packetsFromKg(kg: number, holdingCapacity: number): number {
  if (!(holdingCapacity > 0) || kg <= REPLENISHMENT_QTY_EPSILON) return 0;
  return Math.floor((kg + REPLENISHMENT_QTY_EPSILON) / holdingCapacity);
}

/** Whole bags needed to cover kg (never under-cover remaining demand). */
export function packetsCeilFromKg(kg: number, holdingCapacity: number): number {
  if (!(holdingCapacity > 0) || kg <= REPLENISHMENT_QTY_EPSILON) return 0;
  return Math.max(0, Math.ceil(kg / holdingCapacity - REPLENISHMENT_QTY_EPSILON));
}

export function kgFromPackets(packets: number, holdingCapacity: number): number {
  if (packets <= 0 || !(holdingCapacity > 0)) return 0;
  return round3(packets * holdingCapacity);
}

/** Floor kg down to whole packets of this pack size. */
export function floorToPackets(kg: number, holdingCapacity: number): { packets: number; kg: number } {
  const packets = packetsFromKg(kg, holdingCapacity);
  return { packets, kg: kgFromPackets(packets, holdingCapacity) };
}

/** Ceil kg up to whole packets so a load covers the shortfall. */
export function ceilToPackets(kg: number, holdingCapacity: number): { packets: number; kg: number } {
  const packets = packetsCeilFromKg(kg, holdingCapacity);
  return { packets, kg: kgFromPackets(packets, holdingCapacity) };
}

export interface TruckSnap {
  exact_tonnes: number;
  snap_up_tonnes: number | null;
  snap_down_tonnes: number | null;
  shortfall_if_down_kg: number | null;
}

export function snapTruck(exactTonnes: number, sizes: number[]): TruckSnap {
  const sorted = [...sizes].filter((s) => s > 0).sort((a, b) => a - b);
  const exact = round3(Math.max(0, exactTonnes));
  if (sorted.length === 0 || exact <= REPLENISHMENT_QTY_EPSILON) {
    return {
      exact_tonnes: exact,
      snap_up_tonnes: null,
      snap_down_tonnes: null,
      shortfall_if_down_kg: null,
    };
  }
  const snapUp = sorted.find((s) => s + REPLENISHMENT_QTY_EPSILON >= exact) ?? null;
  const downCandidates = sorted.filter((s) => s < exact - REPLENISHMENT_QTY_EPSILON);
  const snapDown = downCandidates.length > 0 ? downCandidates[downCandidates.length - 1] : null;
  return {
    exact_tonnes: exact,
    snap_up_tonnes: snapUp,
    snap_down_tonnes: snapDown,
    shortfall_if_down_kg:
      snapDown != null ? round3(tonnesToKg(exact) - tonnesToKg(snapDown)) : null,
  };
}

export interface EngineSkuInput {
  product_id: string;
  packaging_id: string;
  product_name: string;
  holding_capacity: number;
  fgi_kg: number;
  fgi_packets: number;
  draft_kg: number;
  demand_kg: number;
  trend_sold_kg: number;
}

export interface EngineSkuComputed {
  product_id: string;
  packaging_id: string;
  product_name: string;
  holding_capacity: number;
  fgi_kg: number;
  fgi_packets: number;
  draft_kg: number;
  available_kg: number;
  available_packets: number;
  demand_kg: number;
  demand_packets: number;
  gap_kg: number;
  gap_packets: number;
  surplus_kg: number;
  trend_sold_kg: number;
  daily_kg: number;
  safety_kg: number;
  safety_packets: number;
  trend_share: number;
  load_orders_kg: number;
  load_orders_packets: number;
  load_with_safety_kg: number;
  load_with_safety_packets: number;
}

export function computeSkuRows(
  inputs: EngineSkuInput[],
  trendWindowDays: number,
  safetyDays: number
): EngineSkuComputed[] {
  const window = Math.max(1, trendWindowDays);
  const safety = Math.max(0, safetyDays);
  const totalTrend = inputs.reduce((s, r) => s + Math.max(0, r.trend_sold_kg), 0);

  return inputs.map((row) => {
    const cap = Number(row.holding_capacity) || 0;
    const fgiKg = round3(Math.max(0, row.fgi_kg));
    const draftKg = round3(Math.max(0, row.draft_kg));
    const demandKg = round3(Math.max(0, row.demand_kg));
    const trendSold = round3(Math.max(0, row.trend_sold_kg));
    const availableKg = round3(Math.max(0, fgiKg - draftKg));
    const gapKg = round3(Math.max(0, demandKg - availableKg));
    const surplusKg = round3(Math.max(0, availableKg - demandKg));
    const dailyKg = round3(trendSold / window);
    const safetyKg = round3(dailyKg * safety);
    const loadA = ceilToPackets(gapKg, cap);
    const loadB = ceilToPackets(round3(gapKg + safetyKg), cap);
    const fgiPackets =
      row.fgi_packets > 0 ? Math.round(row.fgi_packets) : packetsFromKg(fgiKg, cap);

    return {
      product_id: row.product_id,
      packaging_id: row.packaging_id,
      product_name: row.product_name,
      holding_capacity: cap,
      fgi_kg: fgiKg,
      fgi_packets: fgiPackets,
      draft_kg: draftKg,
      available_kg: availableKg,
      available_packets: packetsFromKg(availableKg, cap),
      demand_kg: demandKg,
      demand_packets: packetsCeilFromKg(demandKg, cap),
      gap_kg: gapKg,
      gap_packets: loadA.packets,
      surplus_kg: surplusKg,
      trend_sold_kg: trendSold,
      daily_kg: dailyKg,
      safety_kg: safetyKg,
      safety_packets: packetsFromKg(safetyKg, cap),
      trend_share: totalTrend > REPLENISHMENT_QTY_EPSILON ? round3(trendSold / totalTrend) : 0,
      load_orders_kg: loadA.kg,
      load_orders_packets: loadA.packets,
      load_with_safety_kg: loadB.kg,
      load_with_safety_packets: loadB.packets,
    };
  });
}

export interface FillTruckSkuResult {
  for_orders_kg: number;
  for_orders_packets: number;
  for_trend_kg: number;
  for_trend_packets: number;
  load_kg: number;
  load_packets: number;
  load_tonnes: number;
  still_short_kg: number;
  still_short_packets: number;
}

export interface FillTruckResult {
  truck_tonnes: number;
  capacity_kg: number;
  allocated_kg: number;
  unallocated_kg: number;
  still_short_kg: number;
  by_sku: Map<string, FillTruckSkuResult>;
}

/**
 * Fill a truck: covering bags (Line A, ceiled) first, leftover capacity by trend share.
 * If capacity cannot fit those covering bags, scale gaps only — no trend extras —
 * and floor so the truck is not overfilled.
 */
export function fillTruck(rows: EngineSkuComputed[], truckTonnes: number): FillTruckResult {
  const capacityKg = tonnesToKg(truckTonnes);
  const bySku = new Map<string, FillTruckSkuResult>();
  const empty = (): FillTruckSkuResult => ({
    for_orders_kg: 0,
    for_orders_packets: 0,
    for_trend_kg: 0,
    for_trend_packets: 0,
    load_kg: 0,
    load_packets: 0,
    load_tonnes: 0,
    still_short_kg: 0,
    still_short_packets: 0,
  });

  for (const row of rows) {
    bySku.set(skuKey(row.product_id, row.packaging_id), empty());
  }

  if (capacityKg <= REPLENISHMENT_QTY_EPSILON || rows.length === 0) {
    return {
      truck_tonnes: round3(truckTonnes),
      capacity_kg: capacityKg,
      allocated_kg: 0,
      unallocated_kg: capacityKg,
      still_short_kg: round3(rows.reduce((s, r) => s + r.load_orders_kg, 0)),
      by_sku: bySku,
    };
  }

  const totalCoverKg = round3(rows.reduce((s, r) => s + r.load_orders_kg, 0));
  const totalTrend = round3(rows.reduce((s, r) => s + r.trend_sold_kg, 0));
  const shortTruck = capacityKg + REPLENISHMENT_QTY_EPSILON < totalCoverKg;
  const scale =
    shortTruck && totalCoverKg > REPLENISHMENT_QTY_EPSILON ? capacityKg / totalCoverKg : 1;
  const leftoverKg = shortTruck ? 0 : round3(Math.max(0, capacityKg - totalCoverKg));

  const raw = rows.map((row) => {
    const rawOrders = shortTruck ? round3(row.load_orders_kg * scale) : row.load_orders_kg;
    const rawTrend =
      shortTruck || leftoverKg <= REPLENISHMENT_QTY_EPSILON || totalTrend <= REPLENISHMENT_QTY_EPSILON
        ? 0
        : round3(leftoverKg * (row.trend_sold_kg / totalTrend));
    return { row, rawOrders, rawTrend };
  });

  for (const item of raw) {
    const cap = item.row.holding_capacity;
    const key = skuKey(item.row.product_id, item.row.packaging_id);
    const totalRaw = round3(item.rawOrders + item.rawTrend);
    const load = floorToPackets(totalRaw, cap);
    const orders = shortTruck
      ? floorToPackets(item.rawOrders, cap)
      : ceilToPackets(item.rawOrders, cap);
    const ordersPackets = Math.min(orders.packets, load.packets);
    const ordersKg = kgFromPackets(ordersPackets, cap);
    const trendPackets = load.packets - ordersPackets;
    const trendKg = kgFromPackets(trendPackets, cap);
    const cover = ceilToPackets(item.row.gap_kg, cap);
    const stillShortKg = round3(Math.max(0, cover.kg - ordersKg));
    bySku.set(key, {
      for_orders_kg: ordersKg,
      for_orders_packets: ordersPackets,
      for_trend_kg: trendKg,
      for_trend_packets: trendPackets,
      load_kg: load.kg,
      load_packets: load.packets,
      load_tonnes: kgToTonnes(load.kg),
      still_short_kg: stillShortKg,
      still_short_packets: packetsFromKg(stillShortKg, cap),
    });
  }

  const allocatedKg = round3([...bySku.values()].reduce((s, r) => s + r.load_kg, 0));
  const stillShortKg = round3([...bySku.values()].reduce((s, r) => s + r.still_short_kg, 0));
  const unallocatedKg = round3(Math.max(0, capacityKg - allocatedKg));

  return {
    truck_tonnes: round3(truckTonnes),
    capacity_kg: capacityKg,
    allocated_kg: allocatedKg,
    unallocated_kg: unallocatedKg,
    still_short_kg: stillShortKg,
    by_sku: bySku,
  };
}
