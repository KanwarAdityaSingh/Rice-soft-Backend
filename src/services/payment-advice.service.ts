import { kaantaDAO } from '../dao/kaanta.dao';
import { saudaDAO } from '../dao/sauda.dao';
import { inwardSlipLotDAO } from '../dao/inward-slip-lot.dao';
import { purchaseSummaryDAO } from '../dao/purchase-summary.dao';
import { paymentAdviceDAO } from '../dao/payment-advice.dao';
import { PaymentAdvice, UpdatePaymentAdviceDTO, PaymentAdvicePreviewResponse } from '../models/payment-advice.model';
import type { PaymentAdviceWeightVariance } from '../models/sauda-weight-variance.model';
import { computeKaantaPricingNetWeight, floorToMoneyStep, type KaantaWeightVariance } from '../utils/money';
import { logger } from '../utils/logger';
import { ValidationError } from '../utils/errors';
import type { CalculationPolicyId } from '../constants/calculation-policies';
import { calculationContextService } from './calculation-context.service';
import type { PurchaseSummaryQueryOptions } from '../dao/purchase-summary.dao';
import { saudaWeightVarianceService } from './sauda-weight-variance.service';

/** Per-sauda variance detail kept alongside the aggregated metrics, used to write the audit ledger. */
export type SaudaWeightVarianceDetail = {
  saudaId: string;
  brokerId: string | null;
  purchaserId: string | null;
  variance: KaantaWeightVariance;
};

export type PaymentAdviceKaantaMetrics = {
  bill_weight: number | null;
  kanta_weight: number | null;
  dana_deduction: number | null;
  final_weight: number | null;
  /** Aggregated, frontend-facing note. Only ever set for Ex-Godown saudas with a detected variance. */
  weight_variance: PaymentAdviceWeightVariance | null;
  /** Internal: one entry per Ex-Godown sauda with a variance, used to write sauda_weight_variance_records. */
  variance_details: SaudaWeightVarianceDetail[];
};

type KaantaWeightFields = {
  bill_weight?: number;
  kanta_weight?: number;
  dana_deduction?: number;
  final_weight?: number;
};

/**
 * Dana / final-weight / amount helpers shared by payment-advice API and kaanta sync.
 */
export class PaymentAdviceService {
  /**
   * Pricing weights from current kaanta rows (sauda-scoped or ISP-scoped).
   * When both IDs are present, sauda_id takes precedence (same as payment-advice create).
   */
  async computeKaantaMetrics(
    saudaId?: string | null,
    ispId?: string | null
  ): Promise<PaymentAdviceKaantaMetrics | null> {
    if (saudaId) {
      return this.computeKaantaMetricsForSauda(saudaId);
    }
    if (ispId) {
      return this.computeKaantaMetricsForIsp(ispId);
    }
    return null;
  }

  private async computeKaantaMetricsForSauda(saudaId: string): Promise<PaymentAdviceKaantaMetrics | null> {
    const sauda = await saudaDAO.findById(saudaId);
    const shouldCalculateDana = sauda?.is_dana_required ?? false;
    const isExGodown = sauda?.sauda_type === 'exgodown';

    const { rows: kaantas } = await kaantaDAO.findAll(saudaId);
    if (kaantas.length === 0) {
      return null;
    }

    const totalKaantaWeight = kaantas.reduce((sum, k) => sum + Number(k.kaanta_weight ?? 0), 0);
    const totalSaidSentWeight = kaantas.reduce((sum, k) => sum + Number(k.said_sent_weight ?? 0), 0);
    const totalBillWeight = await inwardSlipLotDAO.sumBillWeightForSauda(saudaId);

    const pricing = computeKaantaPricingNetWeight({
      totalKaantaWeight,
      totalBillWeight,
      totalSaidSentWeight,
      isDanaRequired: shouldCalculateDana,
      useBillWeightOnly: isExGodown,
    });

    const varianceDetails: SaudaWeightVarianceDetail[] = [];
    let weightVariance: PaymentAdviceWeightVariance | null = null;
    if (pricing.weightVariance) {
      weightVariance = saudaWeightVarianceService.toResponseVariance(pricing.weightVariance);
      varianceDetails.push({
        saudaId,
        brokerId: sauda?.broker_id ?? null,
        purchaserId: sauda?.purchaser_id ?? null,
        variance: pricing.weightVariance,
      });
    }

    return {
      bill_weight: totalSaidSentWeight > 0 ? totalSaidSentWeight : null,
      kanta_weight: totalKaantaWeight > 0 ? totalKaantaWeight : null,
      dana_deduction: pricing.danaDeductionKg > 0 ? pricing.danaDeductionKg : null,
      final_weight: pricing.netWeightForPricing > 0 ? pricing.netWeightForPricing : null,
      weight_variance: weightVariance,
      variance_details: varianceDetails,
    };
  }

  private async computeKaantaMetricsForIsp(ispId: string): Promise<PaymentAdviceKaantaMetrics | null> {
    const { rows: kaantas } = await kaantaDAO.findAll(undefined, ispId);
    if (kaantas.length === 0) {
      return null;
    }

    const kaantasBySauda = new Map<string, typeof kaantas>();
    for (const kaanta of kaantas) {
      if (!kaantasBySauda.has(kaanta.sauda_id)) {
        kaantasBySauda.set(kaanta.sauda_id, []);
      }
      kaantasBySauda.get(kaanta.sauda_id)!.push(kaanta);
    }

    let totalKaantaWeight = 0;
    let totalSaidSentWeight = 0;
    let totalDanaDeduction = 0;
    let totalNetPricingWeight = 0;

    const saudaIds = Array.from(kaantasBySauda.keys());
    const saudas = await Promise.all(saudaIds.map((id) => saudaDAO.findById(id)));

    const saudaMap = new Map<
      string,
      { isDanaRequired: boolean; isExGodown: boolean; brokerId: string | null; purchaserId: string | null }
    >();
    saudas.forEach((sauda, index) => {
      if (sauda) {
        saudaMap.set(saudaIds[index], {
          isDanaRequired: sauda.is_dana_required ?? false,
          isExGodown: sauda.sauda_type === 'exgodown',
          brokerId: sauda.broker_id ?? null,
          purchaserId: sauda.purchaser_id ?? null,
        });
      }
    });

    // Net (not absolute) sum across Ex-Godown saudas in this ISP, so an aggregated note still
    // makes sense when an ISP spans multiple Ex-Godown saudas.
    let exGodownKaantaTotal = 0;
    let exGodownBillTotal = 0;
    let hasExGodownVariance = false;
    const varianceDetails: SaudaWeightVarianceDetail[] = [];

    for (const [saudaId, saudaKaantas] of kaantasBySauda.entries()) {
      const saudaInfo = saudaMap.get(saudaId);
      const isDanaRequired = saudaInfo?.isDanaRequired ?? false;
      const isExGodown = saudaInfo?.isExGodown ?? false;
      const saudaKaantaWeight = saudaKaantas.reduce((sum, k) => sum + Number(k.kaanta_weight ?? 0), 0);
      const saudaSaidSentWeight = saudaKaantas.reduce((sum, k) => sum + Number(k.said_sent_weight ?? 0), 0);

      totalKaantaWeight += saudaKaantaWeight;
      totalSaidSentWeight += saudaSaidSentWeight;

      const totalBillWeight = await inwardSlipLotDAO.sumBillWeightForSauda(saudaId);
      const pricing = computeKaantaPricingNetWeight({
        totalKaantaWeight: saudaKaantaWeight,
        totalBillWeight,
        totalSaidSentWeight: saudaSaidSentWeight,
        isDanaRequired,
        useBillWeightOnly: isExGodown,
      });
      totalDanaDeduction += pricing.danaDeductionKg;
      totalNetPricingWeight += pricing.netWeightForPricing;

      if (pricing.weightVariance) {
        hasExGodownVariance = true;
        exGodownKaantaTotal += pricing.weightVariance.kantaWeight;
        exGodownBillTotal += pricing.weightVariance.billWeight;
        varianceDetails.push({
          saudaId,
          brokerId: saudaInfo?.brokerId ?? null,
          purchaserId: saudaInfo?.purchaserId ?? null,
          variance: pricing.weightVariance,
        });
      }
    }

    let weightVariance: PaymentAdviceWeightVariance | null = null;
    if (hasExGodownVariance && Math.abs(exGodownKaantaTotal - exGodownBillTotal) > 1e-9) {
      weightVariance = saudaWeightVarianceService.toResponseVariance({
        direction: exGodownKaantaTotal < exGodownBillTotal ? 'short' : 'excess',
        varianceKg: Math.abs(exGodownKaantaTotal - exGodownBillTotal),
        billWeight: exGodownBillTotal,
        kantaWeight: exGodownKaantaTotal,
      });
    }

    return {
      bill_weight: totalSaidSentWeight > 0 ? totalSaidSentWeight : null,
      kanta_weight: totalKaantaWeight > 0 ? totalKaantaWeight : null,
      dana_deduction: totalDanaDeduction > 0 ? totalDanaDeduction : null,
      final_weight: totalNetPricingWeight > 0 ? totalNetPricingWeight : null,
      weight_variance: weightVariance,
      variance_details: varianceDetails,
    };
  }

  async resolveAmountFromSummary(
    saudaId?: string | null,
    ispId?: string | null,
    calculationPolicyId?: CalculationPolicyId | null
  ): Promise<number | null> {
    const summaryOptions: PurchaseSummaryQueryOptions | undefined = calculationPolicyId
      ? { calculationPolicyId }
      : undefined;

    if (saudaId) {
      const summary = await purchaseSummaryDAO.getSaudaSummary(saudaId, undefined, summaryOptions);
      return floorToMoneyStep(summary.final_total_amount);
    }
    if (ispId) {
      const summary = await purchaseSummaryDAO.getIspSummary(ispId, undefined, summaryOptions);
      return floorToMoneyStep(summary.final_total_amount);
    }
    return null;
  }

  /**
   * Single payload for PA document preview — same amount/weight rules as create & update.
   * Requires sauda_id and/or inward_slip_pass_id (sauda_id takes precedence for amount & weights).
   */
  async buildPreview(input: {
    saudaId?: string | null;
    ispId?: string | null;
    godownId?: string;
    totalCharges?: number;
  }): Promise<PaymentAdvicePreviewResponse> {
    const saudaId = input.saudaId ?? null;
    const ispId = input.ispId ?? null;

    if (!saudaId && !ispId) {
      throw new ValidationError('Either sauda_id or inward_slip_pass_id must be provided');
    }

    const calculationContext = await calculationContextService.resolveForCreate({ saudaId, ispId });
    const summaryOptions: PurchaseSummaryQueryOptions = {
      calculationPolicyId: calculationContext.policyId,
    };

    const summary = saudaId
      ? await purchaseSummaryDAO.getSaudaSummary(saudaId, input.godownId, summaryOptions)
      : await purchaseSummaryDAO.getIspSummary(ispId!, input.godownId, summaryOptions);

    const metrics = await this.computeKaantaMetrics(saudaId, ispId);
    const amount = floorToMoneyStep(summary.final_total_amount);
    const totalCharges = floorToMoneyStep(input.totalCharges ?? 0);
    const netPayable = floorToMoneyStep(amount - totalCharges);

    return {
      sauda_id: saudaId,
      inward_slip_pass_id: ispId,
      bill_weight: metrics?.bill_weight ?? null,
      kanta_weight: metrics?.kanta_weight ?? null,
      dana_deduction: metrics?.dana_deduction ?? null,
      final_weight: metrics?.final_weight ?? null,
      weight_variance: metrics?.weight_variance ?? null,
      total_bags: summary.total_bags,
      total_weight: summary.total_weight,
      amount,
      total_charges: totalCharges,
      net_payable: netPayable,
      financial_year: calculationContext.financialYear,
      calculation_policy_id: calculationContext.policyId,
      summary,
    };
  }

  /**
   * Persist ledger rows for any Ex-Godown weight variances found on this metrics computation.
   * Safe to call unconditionally — no-op when `metrics` has no variance details.
   * Call after the payment advice row exists (create/update/sync), since the ledger FKs to it.
   */
  async recordWeightVariances(
    metrics: PaymentAdviceKaantaMetrics | null,
    paymentAdviceId: string,
    inwardSlipPassId?: string | null,
    createdBy?: string | null
  ): Promise<void> {
    if (!metrics || metrics.variance_details.length === 0) {
      return;
    }
    for (const detail of metrics.variance_details) {
      await saudaWeightVarianceService.recordIfChanged({
        saudaId: detail.saudaId,
        paymentAdviceId,
        inwardSlipPassId: inwardSlipPassId ?? null,
        brokerId: detail.brokerId,
        purchaserId: detail.purchaserId,
        variance: detail.variance,
        createdBy: createdBy ?? null,
      });
    }
  }

  /** Apply computed kaanta metrics onto create/update DTOs (overwrites weight fields). */
  applyKaantaMetricsToDto<T extends KaantaWeightFields>(
    dto: T,
    metrics: PaymentAdviceKaantaMetrics | null,
    options?: { preserveBillWeight?: boolean; preserveKantaWeight?: boolean }
  ): void {
    if (!metrics) {
      return;
    }

    if (!options?.preserveBillWeight && metrics.bill_weight != null) {
      dto.bill_weight = metrics.bill_weight;
    }
    if (!options?.preserveKantaWeight && metrics.kanta_weight != null) {
      dto.kanta_weight = metrics.kanta_weight;
    }
    // Use 0 when absent so updates clear a previously stored dana value (DAO maps 0 → null).
    dto.dana_deduction = metrics.dana_deduction ?? 0;
    dto.final_weight = metrics.final_weight ?? undefined;
  }

  /**
   * Recompute weights and amount for pending payment advices linked to a kaanta's sauda or ISP.
   * Called after kaanta create / update / delete so dana and purchase-summary amount stay in sync.
   */
  async syncLinkedPendingFromKaanta(input: {
    saudaId: string;
    inwardSlipPassId?: string | null;
    updatedBy?: string | null;
  }): Promise<number> {
    const linked = await paymentAdviceDAO.findPendingLinked(
      input.saudaId,
      input.inwardSlipPassId ?? null
    );

    if (linked.length === 0) {
      return 0;
    }

    let synced = 0;
    for (const advice of linked) {
      await this.syncSinglePaymentAdviceFromKaanta(advice, input.updatedBy);
      synced += 1;
    }

    logger.info('Synced payment advices from kaanta change', {
      saudaId: input.saudaId,
      inwardSlipPassId: input.inwardSlipPassId,
      syncedCount: synced,
    });

    return synced;
  }

  private async syncSinglePaymentAdviceFromKaanta(
    advice: PaymentAdvice,
    updatedBy?: string | null
  ): Promise<void> {
    const metrics = await this.computeKaantaMetrics(advice.sauda_id, advice.inward_slip_pass_id);
    if (!metrics) {
      return;
    }

    const calculationContext = await calculationContextService.resolveForPaymentAdvice(advice);
    const amount = await this.resolveAmountFromSummary(
      advice.sauda_id,
      advice.inward_slip_pass_id,
      calculationContext.policyId
    );

    const updateData: UpdatePaymentAdviceDTO = {
      bill_weight: metrics.bill_weight ?? undefined,
      kanta_weight: metrics.kanta_weight ?? undefined,
      dana_deduction: metrics.dana_deduction ?? 0,
      final_weight: metrics.final_weight ?? undefined,
      updated_by: updatedBy ?? undefined,
    };

    if (amount != null) {
      updateData.amount = amount;
    }

    await paymentAdviceDAO.update(advice.id, updateData);
    await this.recordWeightVariances(metrics, advice.id, advice.inward_slip_pass_id, updatedBy);
  }
}

export const paymentAdviceService = new PaymentAdviceService();
