import { saudaDAO } from '../dao/sauda.dao';
import { inwardSlipPassDAO } from '../dao/inward-slip-pass.dao';
import {
  DEFAULT_CALCULATION_POLICY_ID,
  getCalculationPolicy,
  isCalculationPolicyId,
  type CalculationPolicyId,
  type PaymentCalculationPolicy,
} from '../constants/calculation-policies';
import { resolvePolicyFromDate } from '../constants/financial-year';
import type { PaymentAdvice } from '../models/payment-advice.model';
import { NotFoundError } from '../utils/errors';

export type CalculationContext = {
  financialYear: string | null;
  policyId: CalculationPolicyId;
  policy: PaymentCalculationPolicy;
};

function contextFromPolicyId(
  policyId: CalculationPolicyId,
  financialYear: string | null
): CalculationContext {
  return {
    financialYear,
    policyId,
    policy: getCalculationPolicy(policyId),
  };
}

function defaultContext(): CalculationContext {
  return contextFromPolicyId(DEFAULT_CALCULATION_POLICY_ID, null);
}

export class CalculationContextService {
  contextFromDate(value: Date | string): CalculationContext {
    const resolved = resolvePolicyFromDate(value);
    return contextFromPolicyId(resolved.policyId, resolved.financialYear);
  }

  contextFromStoredPolicy(
    policyId: string | null | undefined,
    financialYear: string | null | undefined
  ): CalculationContext {
    if (isCalculationPolicyId(policyId)) {
      return contextFromPolicyId(policyId, financialYear ?? null);
    }
    return defaultContext();
  }

  async resolveForCreate(input: {
    saudaId?: string | null;
    ispId?: string | null;
  }): Promise<CalculationContext> {
    if (input.saudaId) {
      const sauda = await saudaDAO.findById(input.saudaId);
      if (!sauda) {
        throw new NotFoundError('Sauda not found');
      }
      if (sauda.sauda_date) {
        return this.contextFromDate(sauda.sauda_date);
      }
    }

    if (input.ispId) {
      const isp = await inwardSlipPassDAO.findById(input.ispId);
      if (!isp) {
        throw new NotFoundError('Inward slip pass not found');
      }
      return this.contextFromDate(isp.date);
    }

    return defaultContext();
  }

  async resolveForPaymentAdvice(advice: PaymentAdvice): Promise<CalculationContext> {
    if (isCalculationPolicyId(advice.calculation_policy_id)) {
      return this.contextFromStoredPolicy(advice.calculation_policy_id, advice.financial_year);
    }
    return this.resolveForCreate({
      saudaId: advice.sauda_id,
      ispId: advice.inward_slip_pass_id,
    });
  }

  linksChanged(
    existing: PaymentAdvice,
    nextSaudaId: string | null,
    nextIspId: string | null
  ): boolean {
    return existing.sauda_id !== nextSaudaId || existing.inward_slip_pass_id !== nextIspId;
  }
}

export const calculationContextService = new CalculationContextService();
