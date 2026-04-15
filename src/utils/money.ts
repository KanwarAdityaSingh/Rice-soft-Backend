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
