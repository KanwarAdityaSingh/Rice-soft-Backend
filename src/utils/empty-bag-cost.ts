/** Round to 2 decimal places (currency). */
export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Round weight to 4 decimal places (kg). */
export function roundWeightKg(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

export interface EmptyBagReceiptSnapshot {
  empty_bags_total_weight_kg: number;
  empty_bags_taxable_amount: number;
  empty_bags_gst_amount: number;
  empty_bags_total_amount: number;
}

/**
 * total_weight = bag_count × weight_per_bag;
 * taxable = total_weight × rate_per_kg;
 * gst = taxable × gst_percent / 100;
 * total = taxable + gst.
 */
export function computeEmptyBagReceiptSnapshot(
  bagCount: number,
  weightPerBagKg: number,
  ratePerKg: number,
  gstPercent: number
): EmptyBagReceiptSnapshot {
  const totalWeight = roundWeightKg(bagCount * weightPerBagKg);
  const taxable = roundMoney(totalWeight * ratePerKg);
  const gst = roundMoney((taxable * gstPercent) / 100);
  const total = roundMoney(taxable + gst);
  return {
    empty_bags_total_weight_kg: totalWeight,
    empty_bags_taxable_amount: taxable,
    empty_bags_gst_amount: gst,
    empty_bags_total_amount: total,
  };
}
