/**
 * Money helpers: amounts are in rupees (same unit as DB DECIMAL / API numbers).
 */

import { ValidationError } from './errors';

const EPS = 1e-9;

/**
 * Parse API / DB money input to a finite number.
 * Rejects strings with more than one "." (common bug: two formatted amounts concatenated).
 */
export function coerceFiniteMoneyNumber(value: unknown, fieldLabel = 'amount'): number {
  if (value === null || value === undefined) {
    throw new ValidationError(`Invalid ${fieldLabel}: missing`);
  }
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return value;
    throw new ValidationError(`Invalid ${fieldLabel}: not a finite number`);
  }
  if (typeof value === 'string') {
    const s = value.replace(/,/g, '').trim();
    if (s === '') {
      throw new ValidationError(`Invalid ${fieldLabel}: empty`);
    }
    if ((s.match(/\./g) ?? []).length > 1) {
      throw new ValidationError(
        `Invalid ${fieldLabel}: "${value}" has multiple decimal points — often two numbers were joined as text.`
      );
    }
    const n = parseFloat(s);
    if (!Number.isFinite(n)) {
      throw new ValidationError(`Invalid ${fieldLabel}: "${value}"`);
    }
    return n;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new ValidationError(`Invalid ${fieldLabel}`);
  }
  return n;
}

/**
 * Round down to the nearest multiple of `step` (default 1 = whole rupees).
 * Coerces numeric strings; rejects malformed multi-decimal strings.
 */
export function floorToMoneyStep(amount: number | string, step = 1): number {
  const n =
    typeof amount === 'number' && Number.isFinite(amount)
      ? amount
      : coerceFiniteMoneyNumber(amount, 'money');
  if (!Number.isFinite(n) || step <= 0 || !Number.isFinite(step)) {
    return typeof amount === 'number' ? amount : Number.NaN;
  }
  return Math.floor((n + EPS) / step) * step;
}

/**
 * Round to nearest whole rupee (half-up): 90.4 → 90, 90.5 → 91.
 * Uses Math.round semantics for positive invoice totals.
 */
export function roundToNearestRupee(amount: number): number {
  if (!Number.isFinite(amount)) return amount;
  return Math.round(amount);
}

/**
 * Dana (husk) deduction in kg: 300 g per quintal = weightKg × (3/1000).
 * Rounded to the nearest whole kg (0.5 rounds up).
 */
export function danaDeductionKgFromWeight(weightKg: number): number {
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    return 0;
  }
  const rawKg = (weightKg * 3) / 1000;
  return Math.round(rawKg);
}

/** @deprecated Use {@link danaDeductionKgFromWeight}; kept for callers passing said-sent weight. */
export function danaDeductionKgFromSaidSentWeight(saidSentWeight: number): number {
  return danaDeductionKgFromWeight(saidSentWeight);
}

export type KaantaPricingWeightInput = {
  totalKaantaWeight: number;
  /** Sum of lot bill_weight (typically sauda quantity); fallback bill cap when said sent is missing. */
  totalBillWeight: number;
  /** Party invoice / said-document weight; primary bill cap when present. */
  totalSaidSentWeight: number;
  isDanaRequired: boolean;
  /**
   * Ex-Godown saudas only: bill is always built on billCap (said_sent, else lot bill_weight) —
   * the vendor invoices for the full contracted quantity regardless of what the re-weigh (kaanta)
   * shows. Kaanta is verification-only; any difference is surfaced as `weightVariance` for
   * reporting and does NOT change gross/dana/net. Omit (or pass false) for FOR saudas, where the
   * existing "pay for what arrived" rule applies: gross = min(kaanta, billCap).
   */
  useBillWeightOnly?: boolean;
};

export type WeightVarianceDirection = 'short' | 'excess';

export type KaantaWeightVariance = {
  /** kaanta < billCap (short) or kaanta > billCap (excess). */
  direction: WeightVarianceDirection;
  /** abs(kaanta - billCap), always > 0. */
  varianceKg: number;
  billWeight: number;
  kantaWeight: number;
};

export type KaantaPricingWeightResult = {
  /**
   * Weight before dana. FOR: min(kaanta, billCap) when billCap > 0, else kaanta-only.
   * Ex-Godown (useBillWeightOnly): billCap when > 0, else kaanta-only (no bill recorded yet).
   */
  grossWeightBeforeDana: number;
  danaDeductionKg: number;
  netWeightForPricing: number;
  /**
   * Set only when useBillWeightOnly and both kaanta & billCap are known and differ.
   * Purely informational — never affects gross/dana/net above.
   */
  weightVariance: KaantaWeightVariance | null;
};

/**
 * Kaanta pricing weights when kaanta exists.
 * Bill cap = said_sent (invoice) when provided, else lot bill_weight (sauda quantity).
 *
 * FOR saudas (default): gross = min(kaanta, billCap) — buyer pays only for what physically arrived.
 * Ex-Godown saudas (useBillWeightOnly): gross = billCap always — vendor is paid for the full
 * contracted quantity; the kaanta re-weigh is recorded for verification only. Any shortfall or
 * excess vs. billCap is reported via `weightVariance` but never changes the amount.
 *
 * Dana (if required) = round(gross × 3/1000); deducted separately as dana_kg × rate before discounts.
 * net = gross − dana — used for PA final_weight display.
 */
export function computeKaantaPricingNetWeight(input: KaantaPricingWeightInput): KaantaPricingWeightResult {
  const kaanta = Number.isFinite(input.totalKaantaWeight) ? Math.max(input.totalKaantaWeight, 0) : 0;
  const bill = Number.isFinite(input.totalBillWeight) ? Math.max(input.totalBillWeight, 0) : 0;
  const said = Number.isFinite(input.totalSaidSentWeight) ? Math.max(input.totalSaidSentWeight, 0) : 0;

  const billCap = said > 0 ? said : bill;
  const useBillWeightOnly = input.useBillWeightOnly ?? false;

  const grossWeightBeforeDana = useBillWeightOnly
    ? billCap > 0
      ? billCap
      : kaanta
    : billCap > 0
      ? Math.min(kaanta, billCap)
      : kaanta;

  const danaDeductionKg =
    input.isDanaRequired && grossWeightBeforeDana > 0
      ? danaDeductionKgFromWeight(grossWeightBeforeDana)
      : 0;

  const netWeightForPricing = Math.max(grossWeightBeforeDana - danaDeductionKg, 0);

  let weightVariance: KaantaWeightVariance | null = null;
  if (useBillWeightOnly && billCap > 0 && kaanta > 0 && Math.abs(kaanta - billCap) > EPS) {
    weightVariance = {
      direction: kaanta < billCap ? 'short' : 'excess',
      varianceKg: Math.abs(kaanta - billCap),
      billWeight: billCap,
      kantaWeight: kaanta,
    };
  }

  return { grossWeightBeforeDana, danaDeductionKg, netWeightForPricing, weightVariance };
}
