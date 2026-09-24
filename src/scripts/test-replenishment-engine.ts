/**
 * Deterministic unit tests for replenishment math (no database).
 * Run: npm run test:replenishment
 */
import {
  ceilToPackets,
  computeSkuRows,
  fillTruck,
  floorToPackets,
  kgFromPackets,
  kgToTonnes,
  packetsCeilFromKg,
  packetsFromKg,
  quantityToKg,
  round3,
  skuKey,
  snapTruck,
  tonnesToKg,
  type EngineSkuInput,
} from '../services/replenishment-engine';

let failed = 0;
let passed = 0;

function assert(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed += 1;
    console.log(`OK  ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function almostEqual(a: number, b: number, eps = 0.001): boolean {
  return Math.abs(a - b) <= eps;
}

function sku(
  product: string,
  pack: string,
  cap: number,
  rest: Partial<EngineSkuInput>
): EngineSkuInput {
  return {
    product_id: product,
    packaging_id: pack,
    product_name: product,
    holding_capacity: cap,
    fgi_kg: 0,
    fgi_packets: 0,
    draft_kg: 0,
    demand_kg: 0,
    trend_sold_kg: 0,
    ...rest,
  };
}

// --- units ---
assert('kg to tonnes', kgToTonnes(1250) === 1.25);
assert('tonnes to kg', tonnesToKg(16) === 16000);
assert('round-trip 14.5 T', almostEqual(kgToTonnes(tonnesToKg(14.5)), 14.5));
assert(
  'packets × 25 kg',
  quantityToKg(80, 'packets', 25, null) === 2000 && kgFromPackets(80, 25) === 2000
);
assert('quantity already kg', quantityToKg(2000, 'kg', 25, 80) === 2000);
assert('floor 6210 kg of 25 kg', (() => {
  const f = floorToPackets(6210, 25);
  return f.packets === 248 && f.kg === 6200;
})());
assert('ceil 6210 kg of 25 kg covers with 249 bags', (() => {
  const c = ceilToPackets(6210, 25);
  return c.packets === 249 && c.kg === 6225;
})());
assert('ceil exact 1250 kg stays 50 bags', ceilToPackets(1250, 25).packets === 50);
assert('packetsFromKg 750 / 25', packetsFromKg(750, 25) === 30);
assert('packetsCeilFromKg 1 kg of 25 kg is 1 bag', packetsCeilFromKg(1, 25) === 1);

// --- ATP: 100 in godown, drafts 70, remaining 80 → available 30, gap 50 bags ---
{
  const rows = computeSkuRows(
    [
      sku('1121', 'p25', 25, {
        fgi_kg: 2500,
        fgi_packets: 100,
        draft_kg: 1750,
        demand_kg: 2000,
      }),
    ],
    30,
    7
  );
  const r = rows[0];
  assert('ATP available kg', r.available_kg === 750);
  assert('ATP available packets', r.available_packets === 30);
  assert('ATP gap kg', r.gap_kg === 1250);
  assert('ATP gap packets', r.gap_packets === 50);
  assert('ATP load A tonnes', kgToTonnes(r.load_orders_kg) === 1.25);
  assert('ATP surplus 0', r.surplus_kg === 0);
}

// --- own draft not double-counted: remaining already excludes own draft ---
{
  const rows = computeSkuRows(
    [
      sku('1121', 'p25', 25, {
        fgi_kg: 2500,
        fgi_packets: 100,
        draft_kg: 750,
        demand_kg: 2000,
      }),
    ],
    30,
    7
  );
  const r = rows[0];
  assert('own-draft available', r.available_kg === 1750);
  assert('own-draft gap packets', r.gap_packets === 10);
}

// --- pack isolation: 25 kg demand does not see 50 kg stock ---
{
  const rows = computeSkuRows(
    [
      sku('1121', 'p25', 25, { fgi_kg: 0, demand_kg: 1000 }),
      sku('1121', 'p50', 50, { fgi_kg: 5000, demand_kg: 0 }),
    ],
    30,
    7
  );
  const p25 = rows.find((r) => r.packaging_id === 'p25')!;
  const p50 = rows.find((r) => r.packaging_id === 'p50')!;
  assert('25 kg gap ignores 50 kg stock', p25.gap_kg === 1000 && p25.available_kg === 0);
  assert('50 kg surplus not used for 25 kg', p50.surplus_kg === 5000 && p50.gap_kg === 0);
  assert('sku keys distinct', skuKey('1121', 'p25') !== skuKey('1121', 'p50'));
}

// --- 30-day trend → 7-day safety ---
{
  const sold = 400 * 25; // 400 bags in 30 days
  const rows = computeSkuRows(
    [sku('1121', 'p25', 25, { demand_kg: 5000, trend_sold_kg: sold })],
    30,
    7
  );
  const r = rows[0];
  const expectedDaily = round3(sold / 30);
  const expectedSafety = round3(expectedDaily * 7);
  assert('daily velocity', almostEqual(r.daily_kg, expectedDaily));
  assert('7-day safety kg', almostEqual(r.safety_kg, expectedSafety));
  assert(
    'line B = gap + safety (ceiled)',
    r.load_with_safety_packets === ceilToPackets(5000 + expectedSafety, 25).packets
  );
  assert('line A is orders only', r.load_orders_kg === 5000);
}

// --- Line A ceils leftover kg to a whole bag ---
{
  const rows = computeSkuRows(
    [sku('1121', 'p25', 25, { demand_kg: 1251 })],
    30,
    7
  );
  const r = rows[0];
  assert('partial kg gap stays exact', r.gap_kg === 1251);
  assert('gap packets round up', r.gap_packets === 51);
  assert('Line A covers with 51 bags', r.load_orders_packets === 51 && r.load_orders_kg === 1275);
  assert('Line A tonnes is 1.275', kgToTonnes(r.load_orders_kg) === 1.275);
}

// --- truck snap ---
{
  const sizes = [9, 16, 21, 25, 32];
  const a = snapTruck(1.25, sizes);
  assert('snap 1.25 T up to 9', a.snap_up_tonnes === 9 && a.snap_down_tonnes === null);
  const b = snapTruck(17, sizes);
  assert('snap 17 T up to 21', b.snap_up_tonnes === 21);
  assert('snap 17 T down to 16', b.snap_down_tonnes === 16);
  assert('shortfall if 16 T', b.shortfall_if_down_kg === 1000);
  const c = snapTruck(16, sizes);
  assert('exact 16 T snaps to itself', c.snap_up_tonnes === 16 && c.snap_down_tonnes === 9);
  const z = snapTruck(0, sizes);
  assert('zero load no snap', z.snap_up_tonnes === null);
}

// --- fill 16 T: gaps 7 T then leftover by 50/20/20/10 ---
{
  const rows = computeSkuRows(
    [
      sku('1121', 'p25', 25, { demand_kg: 5000, trend_sold_kg: 8000 }),
      sku('1509', 'p50', 50, { demand_kg: 2000, trend_sold_kg: 3200 }),
      sku('1121', 'p50', 50, { demand_kg: 0, trend_sold_kg: 3200 }),
      sku('1401', 'p25', 25, { demand_kg: 0, trend_sold_kg: 1600 }),
    ],
    30,
    7
  );
  const fill = fillTruck(rows, 16);
  const a = fill.by_sku.get(skuKey('1121', 'p25'))!;
  const b = fill.by_sku.get(skuKey('1509', 'p50'))!;
  const c = fill.by_sku.get(skuKey('1121', 'p50'))!;
  const d = fill.by_sku.get(skuKey('1401', 'p25'))!;
  assert('16 T capacity', fill.capacity_kg === 16000);
  assert('16 T orders 1121-25 200 bags', a.for_orders_packets === 200 && a.for_orders_kg === 5000);
  assert('16 T orders 1509-50 40 bags', b.for_orders_packets === 40 && b.for_orders_kg === 2000);
  assert('16 T trend extra 1121-25 180 bags', a.for_trend_packets === 180 && a.for_trend_kg === 4500);
  assert('16 T trend extra 1509-50 36 bags', b.for_trend_packets === 36 && b.for_trend_kg === 1800);
  assert('16 T trend-only 1121-50 36 bags', c.for_orders_packets === 0 && c.load_packets === 36);
  assert('16 T trend-only 1401-25 36 bags', d.for_orders_packets === 0 && d.load_packets === 36);
  assert('16 T fully allocated', fill.allocated_kg === 16000 && fill.unallocated_kg === 0);
  assert('16 T not short', fill.still_short_kg === 0);
  assert('16 T 1121-25 total 380 bags', a.load_packets === 380);
}

// --- short 5 T truck: scale gaps, no trend, still short ---
{
  const rows = computeSkuRows(
    [
      sku('1121', 'p25', 25, { demand_kg: 5000, trend_sold_kg: 8000 }),
      sku('1509', 'p50', 50, { demand_kg: 2000, trend_sold_kg: 3200 }),
      sku('1401', 'p25', 25, { demand_kg: 0, trend_sold_kg: 1600 }),
    ],
    30,
    7
  );
  const fill = fillTruck(rows, 5);
  const a = fill.by_sku.get(skuKey('1121', 'p25'))!;
  const b = fill.by_sku.get(skuKey('1509', 'p50'))!;
  const d = fill.by_sku.get(skuKey('1401', 'p25'))!;
  assert('5 T 1121-25 142 bags', a.load_packets === 142 && a.load_kg === 3550);
  assert('5 T 1509-50 28 bags', b.load_packets === 28 && b.load_kg === 1400);
  assert('5 T no trend extras', d.load_packets === 0 && a.for_trend_packets === 0);
  assert('5 T still short 1121', a.still_short_kg === 1450);
  assert('5 T still short 1509', b.still_short_kg === 600);
  assert('5 T total still short', fill.still_short_kg === 2050);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
