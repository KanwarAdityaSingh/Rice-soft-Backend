/**
 * Money helpers: amounts are in rupees (same unit as DB DECIMAL / API numbers).
 */

const EPS = 1e-9;

/**
 * Round down to the nearest multiple of `step` (default 1 = whole rupees).
 */
export function floorToMoneyStep(amount: number, step = 1): number {
  if (!Number.isFinite(amount) || step <= 0 || !Number.isFinite(step)) {
    return amount;
  }
  return Math.floor((amount + EPS) / step) * step;
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
