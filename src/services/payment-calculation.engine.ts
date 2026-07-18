import { getCalculationPolicy, type PaymentCalculationPolicy } from '../constants/calculation-policies';
import type { CalculationPolicyId } from '../constants/calculation-policies';
import { floorToMoneyStep } from '../utils/money';
import { ValidationError } from '../utils/errors';

export type SaudaRowForMetrics = {
  cash_discount: unknown;
  cash_discount_type: string;
  broker_commission: unknown;
  broker_commission_type: string;
  received_until_now: unknown;
  completion_percentage: unknown;
  rate: unknown;
  is_dana_required: boolean | null;
};

export type LotRowForMetrics = {
  no_of_bags?: unknown;
  received_weight?: unknown;
  amount?: unknown;
};

export type PurchaseStepTotals = {
  totalLots: number;
  totalBags: number;
  totalWeight: number;
  baseAmount: number;
  danaDeductionAmount: number;
  amountAfterDana: number;
  cashDiscountAmount: number;
  amountAfterDiscount: number;
  brokerCommissionAmount: number;
  amountAfterCommission: number;
  transportationCost: number;
  amountAfterTransportation: number;
  igstAmount: number;
  igstPercentage: number;
  finalTotalAmount: number;
  netPayable: number;
};

export function computePurchaseStepTotals(input: {
  sauda: SaudaRowForMetrics;
  lots: LotRowForMetrics[];
  transportationCost: number;
  baseAmountOverride?: number;
  danaDeductionAmount?: number;
  policyId?: CalculationPolicyId;
  policy?: PaymentCalculationPolicy;
}): PurchaseStepTotals {
  const policy = input.policy ?? getCalculationPolicy(input.policyId ?? 'current_fy');

  const totalLots = input.lots.length;
  const totalBags = input.lots.reduce((sum, lot) => sum + parseInt(String(lot.no_of_bags || '0'), 10), 0);
  const totalWeight = input.lots.reduce((sum, lot) => sum + parseFloat(String(lot.received_weight || '0')), 0);
  const baseAmount =
    input.baseAmountOverride !== undefined
      ? input.baseAmountOverride
      : input.lots.reduce((sum, lot) => sum + parseFloat(String(lot.amount || '0')), 0);
  const danaAmount = Math.max(Number(input.danaDeductionAmount) || 0, 0);
  const amountAfterDana = Math.max(baseAmount - danaAmount, 0);
  const receivedUntilNow = parseFloat(String(input.sauda.received_until_now || '0'));
  const completionPercentage = input.sauda.completion_percentage
    ? parseFloat(String(input.sauda.completion_percentage))
    : null;
  const isPartialSauda = completionPercentage !== null && completionPercentage < 100;

  let cashDiscountAmount = 0;
  const cashDiscount = parseFloat(String(input.sauda.cash_discount || '0'));
  const cashDiscountType = input.sauda.cash_discount_type || 'rupees';
  if (cashDiscount > 0) {
    const discountBase = policy.cashDiscountBase({ baseAmount, amountAfterDana });
    if (cashDiscountType === 'percentage') {
      cashDiscountAmount = discountBase * (cashDiscount / 100);
    } else {
      cashDiscountAmount = cashDiscount;
    }
  }
  const amountAfterDiscount = amountAfterDana - cashDiscountAmount;

  let brokerCommissionAmount = 0;
  const brokerCommission = parseFloat(String(input.sauda.broker_commission || '0'));
  const brokerCommissionType = input.sauda.broker_commission_type || 'percentage';
  if (brokerCommission > 0) {
    if (brokerCommissionType === 'percentage') {
      brokerCommissionAmount = amountAfterDana * (brokerCommission / 100);
    } else if (brokerCommissionType === 'weight') {
      const weightForCommission = isPartialSauda ? receivedUntilNow : totalWeight;
      brokerCommissionAmount = brokerCommission * weightForCommission;
    } else {
      brokerCommissionAmount = brokerCommission;
    }
  }
  const COMMISSION_EXCESS_EPS = 1e-6;
  if (brokerCommissionAmount - amountAfterDiscount > COMMISSION_EXCESS_EPS) {
    throw new ValidationError(
      'Broker commission exceeds amount after cash discount; reduce commission or adjust discount.'
    );
  }
  const amountAfterCommission = amountAfterDiscount - brokerCommissionAmount;
  const amountAfterTransportation = Number(amountAfterCommission) + Number(input.transportationCost);
  const igstAmount = 0;
  const igstPercentage = 0;
  const finalTotalAmount = Number(amountAfterTransportation) + Number(igstAmount);
  const f = floorToMoneyStep;
  return {
    totalLots,
    totalBags,
    totalWeight,
    baseAmount: f(baseAmount),
    danaDeductionAmount: f(danaAmount),
    amountAfterDana: f(amountAfterDana),
    cashDiscountAmount: f(cashDiscountAmount),
    amountAfterDiscount: f(amountAfterDiscount),
    brokerCommissionAmount: f(brokerCommissionAmount),
    amountAfterCommission: f(amountAfterCommission),
    transportationCost: f(input.transportationCost),
    amountAfterTransportation: f(amountAfterTransportation),
    igstAmount: f(igstAmount),
    igstPercentage,
    finalTotalAmount: f(finalTotalAmount),
    netPayable: f(finalTotalAmount),
  };
}
