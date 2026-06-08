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
 * Dana (husk) deduction in kg from aggregate said-sent weight.
 * Same formula as DB comment: (said_sent_weight * 300/1000) / 100, then rounded up to whole kg.
 */
export function danaDeductionKgFromSaidSentWeight(saidSentWeight: number): number {
  if (!Number.isFinite(saidSentWeight) || saidSentWeight <= 0) {
    return 0;
  }
  const rawKg = (saidSentWeight * 300 / 1000) / 100;
  return Math.ceil(rawKg - EPS);
}

export type KaantaPricingWeightInput = {
  totalKaantaWeight: number;
  /** Sum of lot bill_weight for the sauda (same scope as purchase summary lots). */
  totalBillWeight: number;
  totalSaidSentWeight: number;
  isDanaRequired: boolean;
};

export type KaantaPricingWeightResult = {
  /** Weight before dana: min(kaanta, bill) when bill > 0, else kaanta-only. */
  grossWeightBeforeDana: number;
  danaDeductionKg: number;
  netWeightForPricing: number;
};

/**
 * Commercial net weight for rate × weight pricing when kaanta exists.
 * Uses min(kaanta, bill) then subtracts dana when required (same dana formula as {@link danaDeductionKgFromSaidSentWeight}).
 * If totalBillWeight is 0 or missing, bill does not cap kaanta (backward compatible when lots have no bill yet).
 */
export function computeKaantaPricingNetWeight(input: KaantaPricingWeightInput): KaantaPricingWeightResult {
  const kaanta = Number.isFinite(input.totalKaantaWeight) ? Math.max(input.totalKaantaWeight, 0) : 0;
  const bill = Number.isFinite(input.totalBillWeight) ? Math.max(input.totalBillWeight, 0) : 0;
  const said = Number.isFinite(input.totalSaidSentWeight) ? Math.max(input.totalSaidSentWeight, 0) : 0;

  const danaDeductionKg =
    input.isDanaRequired && said > 0 ? danaDeductionKgFromSaidSentWeight(said) : 0;

  const grossWeightBeforeDana = bill > 0 ? Math.min(kaanta, bill) : kaanta;
  const netWeightForPricing = Math.max(grossWeightBeforeDana - danaDeductionKg, 0);

  return { grossWeightBeforeDana, danaDeductionKg, netWeightForPricing };
}
