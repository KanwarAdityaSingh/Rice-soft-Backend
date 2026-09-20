import { saudaWeightVarianceDAO } from '../dao/sauda-weight-variance.dao';
import {
  CreateSaudaWeightVarianceRecordDTO,
  PaymentAdviceWeightVariance,
  SaudaWeightVarianceRecord,
} from '../models/sauda-weight-variance.model';
import type { KaantaWeightVariance } from '../utils/money';
import { logger } from '../utils/logger';

const WEIGHT_EPS = 0.01; // kg — ignore float noise when comparing to the last recorded value

export interface WeightVarianceRecordInput {
  saudaId: string;
  paymentAdviceId: string;
  inwardSlipPassId?: string | null;
  brokerId?: string | null;
  purchaserId?: string | null;
  variance: KaantaWeightVariance;
  createdBy?: string | null;
}

export class SaudaWeightVarianceService {
  /**
   * Append a new ledger row only when the variance actually changed since the last recorded
   * value for this sauda+payment-advice pair (direction or magnitude). Keeps the ledger a
   * meaningful history instead of one row per PA save.
   */
  async recordIfChanged(input: WeightVarianceRecordInput): Promise<void> {
    const { variance } = input;
    const latest = await saudaWeightVarianceDAO.findLatestBySaudaAndPaymentAdvice(
      input.saudaId,
      input.paymentAdviceId
    );

    const unchanged =
      latest &&
      latest.direction === variance.direction &&
      Math.abs(latest.variance_kg - variance.varianceKg) < WEIGHT_EPS &&
      Math.abs(latest.bill_weight - variance.billWeight) < WEIGHT_EPS &&
      Math.abs(latest.kanta_weight - variance.kantaWeight) < WEIGHT_EPS;

    if (unchanged) {
      return;
    }

    const dto: CreateSaudaWeightVarianceRecordDTO = {
      sauda_id: input.saudaId,
      payment_advice_id: input.paymentAdviceId,
      inward_slip_pass_id: input.inwardSlipPassId ?? null,
      broker_id: input.brokerId ?? null,
      purchaser_id: input.purchaserId ?? null,
      bill_weight: variance.billWeight,
      kanta_weight: variance.kantaWeight,
      variance_kg: variance.varianceKg,
      direction: variance.direction,
      created_by: input.createdBy ?? null,
    };

    try {
      await saudaWeightVarianceDAO.create(dto);
    } catch (error) {
      // Never fail a payment-advice save because the informational ledger write failed.
      logger.error('Failed to record sauda weight variance', { error, input });
    }
  }

  /** Build the frontend-facing note for a single sauda's variance. */
  toResponseVariance(variance: KaantaWeightVariance): PaymentAdviceWeightVariance {
    const verb = variance.direction === 'short' ? 'less than' : 'more than';
    return {
      direction: variance.direction,
      variance_kg: variance.varianceKg,
      bill_weight: variance.billWeight,
      kanta_weight: variance.kantaWeight,
      message: `Kanta weight (${variance.kantaWeight} kg) is ${variance.varianceKg} kg ${verb} bill weight (${variance.billWeight} kg) for this Ex-Godown sauda.`,
    };
  }

  /** Same note, built from a previously persisted ledger row (used when listing/reading saved payment advices). */
  fromRecord(record: SaudaWeightVarianceRecord): PaymentAdviceWeightVariance {
    return this.toResponseVariance({
      direction: record.direction,
      varianceKg: record.variance_kg,
      billWeight: record.bill_weight,
      kantaWeight: record.kanta_weight,
    });
  }
}

export const saudaWeightVarianceService = new SaudaWeightVarianceService();
