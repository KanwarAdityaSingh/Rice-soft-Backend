#!/usr/bin/env ts-node
/**
 * Unit tests for Ex-Godown weight variance logic in computeKaantaPricingNetWeight.
 *
 * Usage:
 *   npx ts-node src/scripts/test-weight-variance.ts
 */
import { computeKaantaPricingNetWeight } from '../utils/money';

type Result = { name: string; pass: boolean; error?: string };
const results: Result[] = [];

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function run(name: string, fn: () => void) {
  try {
    fn();
    results.push({ name, pass: true });
    console.log(`  ✓ ${name}`);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    results.push({ name, pass: false, error });
    console.log(`  ✗ ${name}`);
    console.log(`      ${error}`);
  }
}

console.log('\n=== FOR sauda (existing behavior, unchanged) ===');

run('FOR: gross = min(kaanta, billCap), no variance field', () => {
  const r = computeKaantaPricingNetWeight({
    totalKaantaWeight: 950,
    totalBillWeight: 1000,
    totalSaidSentWeight: 0,
    isDanaRequired: false,
  });
  assert(r.grossWeightBeforeDana === 950, `expected gross 950, got ${r.grossWeightBeforeDana}`);
  assert(r.weightVariance === null, 'FOR saudas must never produce a weight variance');
});

run('FOR: kaanta above bill still caps at billCap, no variance', () => {
  const r = computeKaantaPricingNetWeight({
    totalKaantaWeight: 1100,
    totalBillWeight: 1000,
    totalSaidSentWeight: 0,
    isDanaRequired: false,
  });
  assert(r.grossWeightBeforeDana === 1000, `expected gross 1000, got ${r.grossWeightBeforeDana}`);
  assert(r.weightVariance === null, 'FOR saudas must never produce a weight variance');
});

run('FOR: dana computed on gross (min), matches legacy behavior', () => {
  const r = computeKaantaPricingNetWeight({
    totalKaantaWeight: 950,
    totalBillWeight: 1000,
    totalSaidSentWeight: 0,
    isDanaRequired: true,
  });
  assert(r.danaDeductionKg === 3, `expected dana round(950*3/1000)=3, got ${r.danaDeductionKg}`);
  assert(r.netWeightForPricing === 947, `expected net 947, got ${r.netWeightForPricing}`);
});

console.log('\n=== Ex-Godown sauda (useBillWeightOnly): amount always on billCap ===');

run('ExGodown: shortage — gross stays at billCap, variance flagged as short', () => {
  const r = computeKaantaPricingNetWeight({
    totalKaantaWeight: 950,
    totalBillWeight: 1000,
    totalSaidSentWeight: 0,
    isDanaRequired: false,
    useBillWeightOnly: true,
  });
  assert(r.grossWeightBeforeDana === 1000, `amount basis must stay at billCap 1000, got ${r.grossWeightBeforeDana}`);
  assert(r.weightVariance !== null, 'expected a variance to be flagged');
  assert(r.weightVariance!.direction === 'short', `expected short, got ${r.weightVariance!.direction}`);
  assert(r.weightVariance!.varianceKg === 50, `expected 50kg variance, got ${r.weightVariance!.varianceKg}`);
});

run('ExGodown: excess — gross stays at billCap, variance flagged as excess', () => {
  const r = computeKaantaPricingNetWeight({
    totalKaantaWeight: 1080,
    totalBillWeight: 1000,
    totalSaidSentWeight: 0,
    isDanaRequired: false,
    useBillWeightOnly: true,
  });
  assert(r.grossWeightBeforeDana === 1000, `amount basis must stay at billCap 1000, got ${r.grossWeightBeforeDana}`);
  assert(r.weightVariance !== null, 'expected a variance to be flagged');
  assert(r.weightVariance!.direction === 'excess', `expected excess, got ${r.weightVariance!.direction}`);
  assert(r.weightVariance!.varianceKg === 80, `expected 80kg variance, got ${r.weightVariance!.varianceKg}`);
});

run('ExGodown: dana is computed on billCap, not on kaanta', () => {
  const r = computeKaantaPricingNetWeight({
    totalKaantaWeight: 950,
    totalBillWeight: 1000,
    totalSaidSentWeight: 0,
    isDanaRequired: true,
    useBillWeightOnly: true,
  });
  assert(r.danaDeductionKg === 3, `expected dana round(1000*3/1000)=3, got ${r.danaDeductionKg}`);
  assert(r.netWeightForPricing === 997, `expected net 1000-3=997, got ${r.netWeightForPricing}`);
});

run('ExGodown: kaanta exactly matches billCap — no variance flagged', () => {
  const r = computeKaantaPricingNetWeight({
    totalKaantaWeight: 1000,
    totalBillWeight: 1000,
    totalSaidSentWeight: 0,
    isDanaRequired: false,
    useBillWeightOnly: true,
  });
  assert(r.weightVariance === null, 'exact match must not flag a variance');
});

run('ExGodown: said_sent takes precedence over bill_weight as billCap', () => {
  const r = computeKaantaPricingNetWeight({
    totalKaantaWeight: 900,
    totalBillWeight: 1000,
    totalSaidSentWeight: 950,
    isDanaRequired: false,
    useBillWeightOnly: true,
  });
  assert(r.grossWeightBeforeDana === 950, `expected billCap=said_sent=950, got ${r.grossWeightBeforeDana}`);
  assert(r.weightVariance!.billWeight === 950, 'variance billWeight should reflect said_sent cap');
});

run('ExGodown: no kaanta yet — falls back to billCap, no variance (nothing to compare)', () => {
  const r = computeKaantaPricingNetWeight({
    totalKaantaWeight: 0,
    totalBillWeight: 1000,
    totalSaidSentWeight: 0,
    isDanaRequired: false,
    useBillWeightOnly: true,
  });
  assert(r.grossWeightBeforeDana === 1000, `expected gross=billCap 1000, got ${r.grossWeightBeforeDana}`);
  assert(r.weightVariance === null, 'no kaanta yet means nothing to compare — must not flag');
});

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} tests passed`);
if (failed.length > 0) {
  process.exitCode = 1;
}
