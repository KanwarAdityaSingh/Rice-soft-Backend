import type { KaantaPricingWeightResult } from '../utils/money';

export type CalculationPolicyId = 'legacy_fy' | 'current_fy';

export type KaantaMoneyInputs = {
  baseAmountOverride: number;
  danaDeductionAmount: number;
};

export type CashDiscountBaseInput = {
  baseAmount: number;
  amountAfterDana: number;
};

export type PaymentCalculationPolicy = {
  id: CalculationPolicyId;
  label: string;
  version: number;
  buildKaantaMoneyInputs: (pricing: KaantaPricingWeightResult, rate: number) => KaantaMoneyInputs;
  cashDiscountBase: (step: CashDiscountBaseInput) => number;
};

const legacyFyPolicy: PaymentCalculationPolicy = {
  id: 'legacy_fy',
  label: 'Legacy FY (through 2025–26)',
  version: 1,
  buildKaantaMoneyInputs(pricing, rate) {
    return {
      baseAmountOverride: pricing.netWeightForPricing * rate,
      danaDeductionAmount: 0,
    };
  },
  cashDiscountBase({ amountAfterDana }) {
    return amountAfterDana;
  },
};

const currentFyPolicy: PaymentCalculationPolicy = {
  id: 'current_fy',
  label: 'Current FY (2026–27 onward)',
  version: 1,
  buildKaantaMoneyInputs(pricing, rate) {
    return {
      baseAmountOverride: pricing.grossWeightBeforeDana * rate,
      danaDeductionAmount: pricing.danaDeductionKg * rate,
    };
  },
  cashDiscountBase({ baseAmount }) {
    return baseAmount;
  },
};

export const CALCULATION_POLICIES: Record<CalculationPolicyId, PaymentCalculationPolicy> = {
  legacy_fy: legacyFyPolicy,
  current_fy: currentFyPolicy,
};

export const DEFAULT_CALCULATION_POLICY_ID: CalculationPolicyId = 'current_fy';

export function getCalculationPolicy(policyId: CalculationPolicyId | string): PaymentCalculationPolicy {
  const policy = CALCULATION_POLICIES[policyId as CalculationPolicyId];
  if (!policy) {
    return CALCULATION_POLICIES[DEFAULT_CALCULATION_POLICY_ID];
  }
  return policy;
}

export function isCalculationPolicyId(value: string | null | undefined): value is CalculationPolicyId {
  return value === 'legacy_fy' || value === 'current_fy';
}
