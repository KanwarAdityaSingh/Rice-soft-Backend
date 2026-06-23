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
};

export type KaantaPricingWeightResult = {
  /** Weight before dana: min(kaanta, billCap) when billCap > 0, else kaanta-only. */
  grossWeightBeforeDana: number;
  danaDeductionKg: number;
  netWeightForPricing: number;
};

/**
 * Kaanta pricing weights when kaanta exists.
 * Bill cap = said_sent (invoice) when provided, else lot bill_weight (sauda quantity).
 * Gross = min(kaanta, billCap) — base amount = gross × rate.
 * Dana (if required) = round(gross × 3/1000); deducted separately as dana_kg × rate before discounts.
 * net = gross − dana — used for PA final_weight display.
 */
export function computeKaantaPricingNetWeight(input: KaantaPricingWeightInput): KaantaPricingWeightResult {
  const kaanta = Number.isFinite(input.totalKaantaWeight) ? Math.max(input.totalKaantaWeight, 0) : 0;
  const bill = Number.isFinite(input.totalBillWeight) ? Math.max(input.totalBillWeight, 0) : 0;
  const said = Number.isFinite(input.totalSaidSentWeight) ? Math.max(input.totalSaidSentWeight, 0) : 0;

  const billCap = said > 0 ? said : bill;
  const grossWeightBeforeDana = billCap > 0 ? Math.min(kaanta, billCap) : kaanta;

  const danaDeductionKg =
    input.isDanaRequired && grossWeightBeforeDana > 0
      ? danaDeductionKgFromWeight(grossWeightBeforeDana)
      : 0;

  const netWeightForPricing = Math.max(grossWeightBeforeDana - danaDeductionKg, 0);

  return { grossWeightBeforeDana, danaDeductionKg, netWeightForPricing };
}
