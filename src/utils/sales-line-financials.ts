import type { SalesSaudaDiscountType } from '../models/sales-sauda-line.model';

export type SalesLineFinancialsInput = {
  quantity: number;
  rate: number;
  discountValue: number;
  discountType: SalesSaudaDiscountType;
  gstPercent: number;
  /** When false, GST is 0 even if gstPercent > 0. */
  isTaxable: boolean;
};

export type SalesLineFinancials = {
  /** qty × rate (pre-discount) */
  gross: number;
  discount_amount: number;
  /** Effective ₹/unit after discount (rate − per_kg, or rate − % of rate) */
  discounted_rate: number;
  /** gross − discount (floor at 0) */
  taxable_amount: number;
  gst_amount: number;
  /** taxable + gst */
  final_amount: number;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * List/display rate after line discount.
 * - per_kg: 90 − 2 → 88
 * - percentage: 90 − 2% of 90 → 88.2
 */
export function calculateDiscountedRate(
  rate: number,
  discountValue: number,
  discountType: SalesSaudaDiscountType
): number {
  const raw =
    discountType === 'per_kg'
      ? rate - discountValue
      : rate - (rate * discountValue) / 100;
  return Math.max(0, round2(raw));
}

/**
 * Line money for a given quantity (full sauda qty or dispatch qty).
 * Discount is proportional to the quantity passed in.
 */
export function calculateSalesLineFinancials(input: SalesLineFinancialsInput): SalesLineFinancials {
  const gross = round2(input.quantity * input.rate);
  const discountAmountRaw =
    input.discountType === 'per_kg'
      ? input.discountValue * input.quantity
      : (gross * input.discountValue) / 100;
  const discount_amount = round2(discountAmountRaw);
  const taxable_amount = Math.max(0, round2(gross - discount_amount));
  const gst_amount = input.isTaxable
    ? round2((taxable_amount * input.gstPercent) / 100)
    : 0;
  const final_amount = round2(taxable_amount + gst_amount);
  const discounted_rate = calculateDiscountedRate(
    input.rate,
    input.discountValue,
    input.discountType
  );
  return { gross, discount_amount, discounted_rate, taxable_amount, gst_amount, final_amount };
}
