import type { BrokerCommissionType } from '../models/sauda.model';
import { ValidationError } from '../utils/errors';

function round2(value: number): number {
  return Number(value.toFixed(2));
}

export const SALES_BROKER_COMMISSION_TYPES: BrokerCommissionType[] = [
  'rupees',
  'percentage',
  'weight',
];

export function isBrokerCommissionType(value: unknown): value is BrokerCommissionType {
  return (
    typeof value === 'string' &&
    (SALES_BROKER_COMMISSION_TYPES as string[]).includes(value)
  );
}

/**
 * Sales-side broker commission (same type system as purchase).
 * - percentage: % of sale_amount
 * - weight: rate × quantity_kg
 * - rupees: fixed amount
 */
export function computeSalesBrokerCommission(input: {
  type: BrokerCommissionType;
  rate: number;
  quantity_kg: number;
  sale_amount: number;
}): number {
  const rate = Number(input.rate);
  if (!Number.isFinite(rate) || rate < 0) {
    throw new ValidationError('broker_commission must be a non-negative number');
  }
  if (!(rate > 0)) return 0;

  if (input.type === 'percentage') {
    if (rate > 100) {
      throw new ValidationError('broker_commission percentage cannot exceed 100');
    }
    return round2(Number(input.sale_amount) * (rate / 100));
  }
  if (input.type === 'weight') {
    return round2(rate * Number(input.quantity_kg));
  }
  // rupees
  return round2(rate);
}
