import type { SalesSaudaDiscountType } from '../models/sales-sauda-line.model';
import {
  calculateSalesLineFinancials,
  type SalesLineFinancials,
} from '../utils/sales-line-financials';
import { ValidationError } from '../utils/errors';

export function roundCreditMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function splitGst(
  gstAmount: number,
  interState: boolean
): { cgst_amount: number; sgst_amount: number; igst_amount: number } {
  const gst = roundCreditMoney(Math.max(0, gstAmount));
  if (gst <= 0) {
    return { cgst_amount: 0, sgst_amount: 0, igst_amount: 0 };
  }
  if (interState) {
    return { cgst_amount: 0, sgst_amount: 0, igst_amount: gst };
  }
  const cgst_amount = roundCreditMoney(gst / 2);
  const sgst_amount = roundCreditMoney(gst - cgst_amount);
  return { cgst_amount, sgst_amount, igst_amount: 0 };
}

export type CreditNoteTaxContext = {
  rate: number;
  gstPercent: number;
  discountValue: number;
  discountType: SalesSaudaDiscountType;
  interState: boolean;
};

export type CreditNoteLineFinancials = {
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  final_amount: number;
  gst_percent: number;
  discount_value: number;
  discount_type: SalesSaudaDiscountType;
  rate: number;
};

function fromSalesFinancials(
  financials: SalesLineFinancials,
  ctx: CreditNoteTaxContext
): CreditNoteLineFinancials {
  const split = splitGst(financials.gst_amount, ctx.interState);
  return {
    taxable_amount: financials.taxable_amount,
    cgst_amount: split.cgst_amount,
    sgst_amount: split.sgst_amount,
    igst_amount: split.igst_amount,
    final_amount: financials.final_amount,
    gst_percent: ctx.gstPercent,
    discount_value: ctx.discountValue,
    discount_type: ctx.discountType,
    rate: ctx.rate,
  };
}

export function computeOriginalLineFinal(quantity: number, ctx: CreditNoteTaxContext): number {
  return calculateSalesLineFinancials({
    quantity,
    rate: ctx.rate,
    discountValue: ctx.discountValue,
    discountType: ctx.discountType,
    gstPercent: ctx.gstPercent,
    isTaxable: ctx.gstPercent > 0,
  }).final_amount;
}

/**
 * Quantity-return credit at original invoice rates, scaled down if prior value
 * credits have reduced remaining_value so the invoice cannot be over-credited.
 */
export function computeQuantityReturnFinancials(input: {
  quantity: number;
  remainingQty: number;
  remainingValue: number;
  ctx: CreditNoteTaxContext;
}): CreditNoteLineFinancials {
  const { quantity, remainingValue, ctx } = input;
  const raw = calculateSalesLineFinancials({
    quantity,
    rate: ctx.rate,
    discountValue: ctx.discountValue,
    discountType: ctx.discountType,
    gstPercent: ctx.gstPercent,
    isTaxable: ctx.gstPercent > 0,
  });
  if (raw.final_amount <= remainingValue + 0.009) {
    return fromSalesFinancials(raw, ctx);
  }
  if (remainingValue <= 0) {
    throw new ValidationError(
      `Cannot credit this quantity: remaining eligible invoice value is ₹0.00`
    );
  }
  const scale = remainingValue / raw.final_amount;
  const taxable_amount = roundCreditMoney(raw.taxable_amount * scale);
  const gst_amount = roundCreditMoney(raw.gst_amount * scale);
  const split = splitGst(gst_amount, ctx.interState);
  const gstSum = roundCreditMoney(split.cgst_amount + split.sgst_amount + split.igst_amount);
  return {
    taxable_amount,
    cgst_amount: split.cgst_amount,
    sgst_amount: split.sgst_amount,
    igst_amount: split.igst_amount,
    final_amount: roundCreditMoney(taxable_amount + gstSum),
    gst_percent: ctx.gstPercent,
    discount_value: ctx.discountValue,
    discount_type: ctx.discountType,
    rate: ctx.rate,
  };
}

export function computeRateDifferenceFinancials(input: {
  quantity: number;
  originalRate: number;
  correctedRate: number;
  remainingValue: number;
  ctx: CreditNoteTaxContext;
}): CreditNoteLineFinancials {
  const { quantity, originalRate, correctedRate, remainingValue, ctx } = input;
  if (!(correctedRate < originalRate)) {
    throw new ValidationError('Corrected rate must be less than the original invoice rate');
  }
  const oldFin = calculateSalesLineFinancials({
    quantity,
    rate: originalRate,
    discountValue: ctx.discountValue,
    discountType: ctx.discountType,
    gstPercent: ctx.gstPercent,
    isTaxable: ctx.gstPercent > 0,
  });
  const newFin = calculateSalesLineFinancials({
    quantity,
    rate: correctedRate,
    discountValue: ctx.discountValue,
    discountType: ctx.discountType,
    gstPercent: ctx.gstPercent,
    isTaxable: ctx.gstPercent > 0,
  });
  const taxable_amount = roundCreditMoney(oldFin.taxable_amount - newFin.taxable_amount);
  const gst_amount = roundCreditMoney(oldFin.gst_amount - newFin.gst_amount);
  const final_amount = roundCreditMoney(oldFin.final_amount - newFin.final_amount);
  if (final_amount <= 0) {
    throw new ValidationError('Rate difference must produce a positive credit amount');
  }
  if (final_amount > remainingValue + 0.009) {
    throw new ValidationError(
      `Credit ₹${final_amount.toFixed(2)} exceeds remaining eligible value ₹${remainingValue.toFixed(2)}`
    );
  }
  const split = splitGst(gst_amount, ctx.interState);
  return {
    taxable_amount,
    cgst_amount: split.cgst_amount,
    sgst_amount: split.sgst_amount,
    igst_amount: split.igst_amount,
    final_amount,
    gst_percent: ctx.gstPercent,
    discount_value: ctx.discountValue,
    discount_type: ctx.discountType,
    rate: originalRate,
  };
}

export function computeValueCreditFinancials(input: {
  taxableInput: number;
  remainingValue: number;
  ctx: CreditNoteTaxContext;
}): CreditNoteLineFinancials {
  const { taxableInput, remainingValue, ctx } = input;
  if (!(taxableInput > 0)) {
    throw new ValidationError('Credit amount must be greater than 0');
  }
  const gst_amount = ctx.gstPercent > 0
    ? roundCreditMoney((taxableInput * ctx.gstPercent) / 100)
    : 0;
  const split = splitGst(gst_amount, ctx.interState);
  const final_amount = roundCreditMoney(
    taxableInput + split.cgst_amount + split.sgst_amount + split.igst_amount
  );
  if (final_amount > remainingValue + 0.009) {
    throw new ValidationError(
      `Credit ₹${final_amount.toFixed(2)} exceeds remaining eligible value ₹${remainingValue.toFixed(2)}`
    );
  }
  return {
    taxable_amount: roundCreditMoney(taxableInput),
    cgst_amount: split.cgst_amount,
    sgst_amount: split.sgst_amount,
    igst_amount: split.igst_amount,
    final_amount,
    gst_percent: ctx.gstPercent,
    discount_value: ctx.discountValue,
    discount_type: ctx.discountType,
    rate: ctx.rate,
  };
}

export function sumLineFinancials(lines: CreditNoteLineFinancials[]): {
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_credit_amount: number;
} {
  return {
    taxable_amount: roundCreditMoney(lines.reduce((s, l) => s + l.taxable_amount, 0)),
    cgst_amount: roundCreditMoney(lines.reduce((s, l) => s + l.cgst_amount, 0)),
    sgst_amount: roundCreditMoney(lines.reduce((s, l) => s + l.sgst_amount, 0)),
    igst_amount: roundCreditMoney(lines.reduce((s, l) => s + l.igst_amount, 0)),
    total_credit_amount: roundCreditMoney(lines.reduce((s, l) => s + l.final_amount, 0)),
  };
}
