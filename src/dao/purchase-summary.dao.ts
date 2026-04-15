import { db } from '../database/connection';
import { 
  PurchaseSummary, 
  SaudaSummaryDetails,
  IspSummaryDetails,
  LotSummaryDetails,
  SaudaBreakdown,
  BrokerCommissionSummary,
  BrokerCommissionSummaryLine,
  KaantaPurchaseOverview,
  KaantaMetricSummary,
  KaantaIspOverviewRow,
  KaantaPurchaseIspDetail,
  KaantaIspDetailHeader,
  KaantaPurchaseKaantaRow,
  KaantaPurchaseLotRow,
} from '../models/purchase-summary.model';
import { logger } from '../utils/logger';
import { formatSaudaDisplayId } from '../utils/sauda-display';
import { danaDeductionKgFromSaidSentWeight, floorToMoneyStep } from '../utils/money';
import { ValidationError } from '../utils/errors';
import type { RiceType } from '../models/lead.model';

type SaudaRowForMetrics = {
  cash_discount: unknown;
  cash_discount_type: string;
  broker_commission: unknown;
  broker_commission_type: string;
  received_until_now: unknown;
  completion_percentage: unknown;
  rate: unknown;
  is_dana_required: boolean | null;
};

type LotRowForMetrics = {
  no_of_bags?: unknown;
  received_weight?: unknown;
  amount?: unknown;
};

export class PurchaseSummaryDAO {
  /**
   * Step totals from sauda commercial rules + lot lines + transportation.
   * Broker commission is deducted from the vendor-facing amount (net after discount).
   */
  private computeStepTotalsFromSaudaAndLots(
    sauda: SaudaRowForMetrics,
    lots: LotRowForMetrics[],
    transportationCost: number,
    baseAmountOverride?: number
  ): {
    totalLots: number;
    totalBags: number;
    totalWeight: number;
    baseAmount: number;
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
  } {
    const totalLots = lots.length;
    const totalBags = lots.reduce((sum, lot) => sum + parseInt(String(lot.no_of_bags || '0'), 10), 0);
    const totalWeight = lots.reduce((sum, lot) => sum + parseFloat(String(lot.received_weight || '0')), 0);
    const baseAmount = baseAmountOverride !== undefined
      ? baseAmountOverride
      : lots.reduce((sum, lot) => sum + parseFloat(String(lot.amount || '0')), 0);
    const receivedUntilNow = parseFloat(String(sauda.received_until_now || '0'));
    const completionPercentage = sauda.completion_percentage ? parseFloat(String(sauda.completion_percentage)) : null;
    const isPartialSauda = completionPercentage !== null && completionPercentage < 100;

    let cashDiscountAmount = 0;
    const cashDiscount = parseFloat(String(sauda.cash_discount || '0'));
    const cashDiscountType = sauda.cash_discount_type || 'rupees';
    if (cashDiscount > 0) {
      if (cashDiscountType === 'percentage') {
        cashDiscountAmount = baseAmount * (cashDiscount / 100);
      } else {
        cashDiscountAmount = cashDiscount;
      }
    }
    const amountAfterDiscount = baseAmount - cashDiscountAmount;

    let brokerCommissionAmount = 0;
    const brokerCommission = parseFloat(String(sauda.broker_commission || '0'));
    const brokerCommissionType = sauda.broker_commission_type || 'percentage';
    if (brokerCommission > 0) {
      if (brokerCommissionType === 'percentage') {
        brokerCommissionAmount = amountAfterDiscount * (brokerCommission / 100);
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
    const amountAfterTransportation = amountAfterCommission + transportationCost;
    const igstAmount = 0;
    const igstPercentage = 0;
    const finalTotalAmount = amountAfterTransportation + igstAmount;
    const f = floorToMoneyStep;
    return {
      totalLots,
      totalBags,
      totalWeight,
      baseAmount: f(baseAmount),
      cashDiscountAmount: f(cashDiscountAmount),
      amountAfterDiscount: f(amountAfterDiscount),
      brokerCommissionAmount: f(brokerCommissionAmount),
      amountAfterCommission: f(amountAfterCommission),
      transportationCost: f(transportationCost),
      amountAfterTransportation: f(amountAfterTransportation),
      igstAmount: f(igstAmount),
      igstPercentage,
      finalTotalAmount: f(finalTotalAmount),
      netPayable: f(finalTotalAmount),
    };
  }

  /**
   * Get purchase summary for a single sauda
   * Aggregates all lots and applies sauda-level discounts/commissions
   */
  async getSaudaSummary(saudaId: string, godownId?: string): Promise<PurchaseSummary> {
    // Get sauda details
    const saudaQuery = `
      SELECT id, sauda_type, rice_type, rice_length, rice_code_id, rate, broker_id,
             broker_commission, broker_commission_type, cash_discount, cash_discount_type,
             quantity, received_until_now, completion_percentage, purchaser_id, status, is_dana_required
      FROM saudas
      WHERE id = $1
    `;
    const saudaResult = await db.query(saudaQuery, [saudaId]);
    
    if (saudaResult.rows.length === 0) {
      throw new Error('Sauda not found');
    }
    
    const sauda = saudaResult.rows[0];

    // Get lots for this sauda; optional godownId scopes to physical stock in that godown
    const lotsParams: unknown[] = [saudaId];
    let lotsQuery = `
      SELECT id, lot_number, sauda_id, rice_type, no_of_bags, bag_weight, total_weight,
             bill_weight, received_weight, rate, amount, inward_slip_pass_created_at
      FROM inward_slip_lots
      WHERE sauda_id = $1
    `;
    if (godownId) {
      lotsQuery += ` AND godown_id = $2`;
      lotsParams.push(godownId);
    }
    lotsQuery += ` ORDER BY lot_number`;
    const lotsResult = await db.query(lotsQuery, lotsParams);
    const lots = lotsResult.rows;

    // Get ISPs linked to this sauda (via kaantas); optional godown filter on ISP
    const ispParams: unknown[] = [saudaId];
    let ispQuery = `
      SELECT DISTINCT isp.id, isp.slip_number, isp.date, v.vehicle_number, 
             isp.party_name, isp.transporter_id, isp.transportation_cost
      FROM inward_slip_passes isp
      INNER JOIN kaantas k ON k.inward_slip_pass_id = isp.id
      LEFT JOIN vehicles v ON v.id = isp.vehicle_id
      WHERE k.sauda_id = $1
    `;
    if (godownId) {
      ispQuery += ` AND isp.godown_id = $2`;
      ispParams.push(godownId);
    }
    ispQuery += ` ORDER BY isp.date DESC`;
    const ispResult = await db.query(ispQuery, ispParams);
    const isps = ispResult.rows;

    const transportationCost = isps.reduce((sum, isp) => sum + parseFloat(isp.transportation_cost || '0'), 0);

    // Price calculation uses net receivable weight when dana applies:
    // net weight = total kaanta weight - dana deduction (300gm per quintal on said_sent_weight, ceiled to whole kg).
    const kaantaParams: unknown[] = [saudaId];
    let kaantaQuery = `
      SELECT kaanta_weight, said_sent_weight
      FROM kaantas
      WHERE sauda_id = $1
    `;
    if (godownId) {
      kaantaQuery += ` AND godown_id = $2`;
      kaantaParams.push(godownId);
    }
    const kaantaResult = await db.query<{ kaanta_weight: unknown; said_sent_weight: unknown }>(kaantaQuery, kaantaParams);
    const totalKaantaWeight = kaantaResult.rows.reduce((sum, row) => sum + parseFloat(String(row.kaanta_weight || '0')), 0);
    const totalSaidSentWeight = kaantaResult.rows.reduce((sum, row) => sum + parseFloat(String(row.said_sent_weight || '0')), 0);

    let baseAmountOverride: number | undefined;
    if (totalKaantaWeight > 0) {
      const shouldApplyDana = sauda.is_dana_required ?? false;
      const danaDeduction = shouldApplyDana && totalSaidSentWeight > 0
        ? danaDeductionKgFromSaidSentWeight(totalSaidSentWeight)
        : 0;
      const netWeightForPricing = Math.max(totalKaantaWeight - danaDeduction, 0);
      const saudaRate = parseFloat(String(sauda.rate || '0'));
      baseAmountOverride = netWeightForPricing * saudaRate;
    }

    const step = this.computeStepTotalsFromSaudaAndLots(sauda, lots, transportationCost, baseAmountOverride);
    const {
      totalLots,
      totalBags,
      totalWeight,
      baseAmount,
      cashDiscountAmount,
      amountAfterDiscount,
      brokerCommissionAmount,
      amountAfterCommission,
      amountAfterTransportation,
      igstAmount,
      igstPercentage,
      finalTotalAmount,
    } = step;

    const receivedUntilNow = parseFloat(sauda.received_until_now || '0');
    const weightDifference = Math.abs(totalWeight - receivedUntilNow);
    if (weightDifference > 0.01) {
      logger.warn('Weight mismatch detected', {
        saudaId,
        totalWeightFromLots: totalWeight,
        receivedUntilNow,
        difference: weightDifference
      });
    }
    const completionPercentage = sauda.completion_percentage ? parseFloat(sauda.completion_percentage) : null;

    // Format lot details
    const lotDetails: LotSummaryDetails[] = lots.map(lot => ({
      id: lot.id,
      lot_number: lot.lot_number,
      sauda_id: lot.sauda_id,
      sauda_display_id: formatSaudaDisplayId(lot.sauda_id as string),
      rice_type: lot.rice_type,
      no_of_bags: parseInt(lot.no_of_bags || '0', 10),
      bag_weight: lot.bag_weight ? parseFloat(lot.bag_weight) : null,
      total_weight: lot.total_weight ? parseFloat(lot.total_weight) : null,
      bill_weight: parseFloat(lot.bill_weight),
      received_weight: parseFloat(lot.received_weight),
      rate: parseFloat(lot.rate),
      amount: lot.amount ? parseFloat(lot.amount) : null,
      inward_slip_pass_created_at: lot.inward_slip_pass_created_at
        ? new Date(lot.inward_slip_pass_created_at as string | Date).toISOString()
        : null,
    }));

    // Format ISP details
    const ispDetails: IspSummaryDetails[] = isps.map(isp => ({
      id: isp.id,
      slip_number: isp.slip_number,
      date: isp.date.toISOString().split('T')[0],
      vehicle_number: isp.vehicle_number,
      party_name: isp.party_name,
      transporter_id: isp.transporter_id,
      transportation_cost: isp.transportation_cost ? parseFloat(isp.transportation_cost) : null,
    }));

    // Format sauda details
    const saudaDetails: SaudaSummaryDetails = {
      id: sauda.id,
      display_id: formatSaudaDisplayId(sauda.id as string),
      sauda_type: sauda.sauda_type,
      rice_type: sauda.rice_type,
      rice_length: sauda.rice_length ?? null,
      rice_code_id: sauda.rice_code_id,
      rate: parseFloat(sauda.rate),
      broker_id: sauda.broker_id,
      broker_commission: sauda.broker_commission ? parseFloat(sauda.broker_commission) : null,
      broker_commission_type: sauda.broker_commission_type,
      cash_discount: sauda.cash_discount ? parseFloat(sauda.cash_discount) : null,
      cash_discount_type: sauda.cash_discount_type,
      quantity: sauda.quantity ? parseFloat(sauda.quantity) : null,
      received_until_now: receivedUntilNow,
      completion_percentage: completionPercentage,
      purchaser_id: sauda.purchaser_id,
      status: sauda.status,
    };

    logger.info('Sauda summary calculated', { saudaId, finalTotalAmount });

    return {
      sauda_id: saudaId,
      sauda_display_id: formatSaudaDisplayId(saudaId),
      total_lots: totalLots,
      total_bags: totalBags,
      total_weight: totalWeight,
      base_amount: baseAmount,
      cash_discount_amount: cashDiscountAmount,
      amount_after_discount: amountAfterDiscount,
      broker_commission_amount: brokerCommissionAmount,
      amount_after_commission: amountAfterCommission,
      transportation_cost: transportationCost,
      amount_after_transportation: amountAfterTransportation,
      igst_amount: igstAmount,
      igst_percentage: igstPercentage,
      final_total_amount: finalTotalAmount,
      net_payable: finalTotalAmount,
      sauda_details: saudaDetails,
      isp_details: ispDetails,
      lot_details: lotDetails,
    };
  }

  /**
   * Get purchase summary for an ISP (aggregates all saudas in that ISP)
   * Returns combined summary with per-sauda breakdown
   */
  async getIspSummary(ispId: string, godownId?: string): Promise<PurchaseSummary> {
    // IGST removed - always set to 0
    const igstPercentage = 0;

    // Get ISP details
    const ispQuery = `
      SELECT isp.id, isp.godown_id, isp.slip_number, isp.date, v.vehicle_number, isp.party_name, 
             isp.transporter_id, isp.transportation_cost
      FROM inward_slip_passes isp
      LEFT JOIN vehicles v ON v.id = isp.vehicle_id
      WHERE isp.id = $1
    `;
    const ispResult = await db.query(ispQuery, [ispId]);
    
    if (ispResult.rows.length === 0) {
      throw new Error('Inward slip pass not found');
    }
    
    const isp = ispResult.rows[0];
    if (godownId && isp.godown_id !== godownId) {
      throw new Error('Inward slip pass not found');
    }

    // Get all saudas linked to this ISP (via kaantas)
    const saudasQuery = `
      SELECT DISTINCT s.id
      FROM saudas s
      INNER JOIN kaantas k ON k.sauda_id = s.id
      WHERE k.inward_slip_pass_id = $1
    `;
    const saudasResult = await db.query(saudasQuery, [ispId]);
    const saudaIds = saudasResult.rows.map(row => row.id);

    if (saudaIds.length === 0) {
      throw new Error('No saudas found for this ISP');
    }

    // Get summary for each sauda
    const saudaBreakdowns: SaudaBreakdown[] = [];
    let totalLots = 0;
    let totalBags = 0;
    let totalWeight = 0;
    let totalBaseAmount = 0;
    let totalCashDiscountAmount = 0;
    let totalAmountAfterDiscount = 0;
    let totalBrokerCommissionAmount = 0;
    let totalAmountAfterCommission = 0;
    let totalTransportationCost = 0;
    let totalAmountAfterTransportation = 0;
    let totalIgstAmount = 0;
    let totalFinalAmount = 0;

    for (const saudaId of saudaIds) {
      const saudaSummary = await this.getSaudaSummary(saudaId, godownId);
      
      const breakdown: SaudaBreakdown = {
        sauda_id: saudaId,
        sauda_display_id: formatSaudaDisplayId(saudaId),
        sauda_details: saudaSummary.sauda_details!,
        total_lots: saudaSummary.total_lots,
        total_bags: saudaSummary.total_bags,
        total_weight: saudaSummary.total_weight,
        base_amount: saudaSummary.base_amount,
        cash_discount_amount: saudaSummary.cash_discount_amount,
        amount_after_discount: saudaSummary.amount_after_discount,
        broker_commission_amount: saudaSummary.broker_commission_amount,
        amount_after_commission: saudaSummary.amount_after_commission,
        transportation_cost: saudaSummary.transportation_cost,
        amount_after_transportation: saudaSummary.amount_after_transportation,
        igst_amount: saudaSummary.igst_amount,
        final_total_amount: saudaSummary.final_total_amount,
        lot_details: saudaSummary.lot_details || [],
      };
      
      saudaBreakdowns.push(breakdown);
      
      // Aggregate totals
      totalLots += saudaSummary.total_lots;
      totalBags += saudaSummary.total_bags;
      totalWeight += saudaSummary.total_weight;
      totalBaseAmount += saudaSummary.base_amount;
      totalCashDiscountAmount += saudaSummary.cash_discount_amount;
      totalAmountAfterDiscount += saudaSummary.amount_after_discount;
      totalBrokerCommissionAmount += saudaSummary.broker_commission_amount;
      totalAmountAfterCommission += saudaSummary.amount_after_commission;
      totalTransportationCost += saudaSummary.transportation_cost;
      totalAmountAfterTransportation += saudaSummary.amount_after_transportation;
      totalIgstAmount += saudaSummary.igst_amount;
      totalFinalAmount += saudaSummary.final_total_amount;
    }

    // Format ISP details
    const ispDetails: IspSummaryDetails = {
      id: isp.id,
      slip_number: isp.slip_number,
      date: isp.date.toISOString().split('T')[0],
      vehicle_number: isp.vehicle_number,
      party_name: isp.party_name,
      transporter_id: isp.transporter_id,
      transportation_cost: isp.transportation_cost ? parseFloat(isp.transportation_cost) : null,
    };

    logger.info('ISP summary calculated', { ispId, totalFinalAmount, saudaCount: saudaIds.length });

    const agg = floorToMoneyStep;
    return {
      inward_slip_pass_id: ispId,
      total_lots: totalLots,
      total_bags: totalBags,
      total_weight: totalWeight,
      base_amount: agg(totalBaseAmount),
      cash_discount_amount: agg(totalCashDiscountAmount),
      amount_after_discount: agg(totalAmountAfterDiscount),
      broker_commission_amount: agg(totalBrokerCommissionAmount),
      amount_after_commission: agg(totalAmountAfterCommission),
      transportation_cost: agg(totalTransportationCost),
      amount_after_transportation: agg(totalAmountAfterTransportation),
      igst_amount: agg(totalIgstAmount),
      igst_percentage: igstPercentage,
      final_total_amount: agg(totalFinalAmount),
      net_payable: agg(totalFinalAmount),
      isp_details: [ispDetails],
      saudas: saudaBreakdowns,
    };
  }

  /**
   * Kaanta-only purchase overview: ISPs with ≥1 kaanta for this sauda, metrics from kaanta-linked lots only.
   * Response omits sauda metadata (computed internally from sauda commercial fields).
   */
  async getKaantaPurchaseOverview(saudaId: string, godownId?: string): Promise<KaantaPurchaseOverview> {
    const saudaQuery = `
      SELECT id, sauda_type, rice_type, rice_length, rice_code_id, rate, broker_id,
             broker_commission, broker_commission_type, cash_discount, cash_discount_type,
             quantity, received_until_now, completion_percentage, purchaser_id, status
      FROM saudas
      WHERE id = $1
    `;
    const saudaResult = await db.query(saudaQuery, [saudaId]);
    if (saudaResult.rows.length === 0) {
      throw new Error('Sauda not found');
    }
    const sauda = saudaResult.rows[0];

    const lotsParams: unknown[] = [saudaId];
    let lotsQuery = `
      SELECT l.id, l.lot_number, l.sauda_id, l.rice_type, l.no_of_bags, l.bag_weight, l.total_weight,
             l.bill_weight, l.received_weight, l.rate, l.amount, l.inward_slip_pass_created_at
      FROM inward_slip_lots l
      INNER JOIN kaantas k ON k.sauda_id = l.sauda_id AND l.lot_number = 'LOT-' || k.kaanta_id
      WHERE l.sauda_id = $1
    `;
    if (godownId) {
      lotsQuery += ` AND l.godown_id = $2 AND k.godown_id = $2`;
      lotsParams.push(godownId);
    }
    lotsQuery += ` ORDER BY l.lot_number`;
    const kaantaLotsResult = await db.query(lotsQuery, lotsParams);
    const kaantaLots = kaantaLotsResult.rows;

    const ispParams: unknown[] = [saudaId];
    let ispOverviewQuery = `
      SELECT isp.id, isp.slip_number, isp.date, isp.party_name, isp.transporter_id, isp.transportation_cost,
             MAX(v.vehicle_number) AS vehicle_number,
             COUNT(DISTINCT k.id)::int AS kaanta_count,
             COUNT(DISTINCT l.id)::int AS lot_count
      FROM inward_slip_passes isp
      INNER JOIN kaantas k ON k.inward_slip_pass_id = isp.id AND k.sauda_id = $1
    `;
    if (godownId) {
      ispOverviewQuery += ` AND k.godown_id = $2 AND isp.godown_id = $2`;
      ispParams.push(godownId);
    }
    ispOverviewQuery += `
      LEFT JOIN vehicles v ON v.id = isp.vehicle_id
      LEFT JOIN inward_slip_lots l ON l.sauda_id = k.sauda_id AND l.lot_number = 'LOT-' || k.kaanta_id
    `;
    if (godownId) {
      ispOverviewQuery += ` AND l.godown_id = $2`;
    }
    ispOverviewQuery += `
      GROUP BY isp.id, isp.slip_number, isp.date, isp.party_name, isp.transporter_id, isp.transportation_cost
      ORDER BY isp.date DESC
    `;

    const ispOverviewResult = await db.query(ispOverviewQuery, ispParams);
    const ispRows = ispOverviewResult.rows as Array<{
      id: string;
      slip_number: string;
      date: Date;
      party_name: string;
      transporter_id: string | null;
      transportation_cost: unknown;
      vehicle_number: string | null;
      kaanta_count: number;
      lot_count: number;
    }>;

    const transportationCost = ispRows.reduce(
      (sum, row) => sum + parseFloat(String(row.transportation_cost || '0')),
      0
    );
    const step = this.computeStepTotalsFromSaudaAndLots(sauda, kaantaLots, transportationCost);

    const isps: KaantaIspOverviewRow[] = ispRows.map(row => ({
      id: row.id,
      slip_number: row.slip_number,
      date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date).split('T')[0],
      vehicle_number: row.vehicle_number,
      party_name: row.party_name,
      transporter_id: row.transporter_id,
      transportation_cost: row.transportation_cost != null ? parseFloat(String(row.transportation_cost)) : null,
      kaanta_count: row.kaanta_count,
      lot_count: row.lot_count,
    }));

    const totalKaantas = ispRows.reduce((sum, r) => sum + r.kaanta_count, 0);

    const summary: KaantaMetricSummary = {
      total_isps: ispRows.length,
      total_kaantas: totalKaantas,
      total_lots: step.totalLots,
      total_bags: step.totalBags,
      total_weight_kg: step.totalWeight,
      base_amount: step.baseAmount,
      cash_discount_amount: step.cashDiscountAmount,
      amount_after_discount: step.amountAfterDiscount,
      broker_commission_amount: step.brokerCommissionAmount,
      amount_after_commission: step.amountAfterCommission,
      transportation_cost: step.transportationCost,
      amount_after_transportation: step.amountAfterTransportation,
      net_payable: step.netPayable,
    };

    logger.info('Kaanta purchase overview calculated', { saudaId, netPayable: summary.net_payable, ispCount: isps.length });

    return { summary, isps };
  }

  /**
   * Kaanta + lots for one ISP under a sauda (drill-down). Omits sauda metadata in the response.
   */
  async getKaantaPurchaseIspDetail(saudaId: string, ispId: string, godownId?: string): Promise<KaantaPurchaseIspDetail> {
    const ispQuery = `
      SELECT isp.id, isp.godown_id, isp.slip_number, isp.date, v.vehicle_number, isp.party_name,
             isp.transporter_id, isp.transportation_cost
      FROM inward_slip_passes isp
      LEFT JOIN vehicles v ON v.id = isp.vehicle_id
      WHERE isp.id = $1
    `;
    const ispResult = await db.query(ispQuery, [ispId]);
    if (ispResult.rows.length === 0) {
      throw new Error('Inward slip pass not found');
    }
    const isp = ispResult.rows[0];
    if (godownId && isp.godown_id !== godownId) {
      throw new Error('Inward slip pass not found');
    }

    const checkParams: unknown[] = [saudaId, ispId];
    let kaantaExistsQuery = `SELECT 1 FROM kaantas WHERE sauda_id = $1 AND inward_slip_pass_id = $2`;
    if (godownId) {
      kaantaExistsQuery += ` AND godown_id = $3`;
      checkParams.push(godownId);
    }
    kaantaExistsQuery += ` LIMIT 1`;
    const existsResult = await db.query(kaantaExistsQuery, checkParams);
    if (existsResult.rows.length === 0) {
      throw new Error('No kaanta for this inward slip pass under this sauda');
    }

    const kaParams: unknown[] = [saudaId, ispId];
    let kaQuery = `
      SELECT id, kaanta_id, full_truck_weight, empty_truck_weight, kaanta_weight, said_sent_weight,
             bag_weight, no_of_bags, bag_type, khaali_kaanta_parchi_url, bhara_kaanta_parchi_url
      FROM kaantas
      WHERE sauda_id = $1 AND inward_slip_pass_id = $2
    `;
    if (godownId) {
      kaQuery += ` AND godown_id = $3`;
      kaParams.push(godownId);
    }
    kaQuery += ` ORDER BY created_at ASC`;
    const kaResult = await db.query(kaQuery, kaParams);

    const lotsParams: unknown[] = [saudaId, ispId];
    let lotsQuery = `
      SELECT l.id, l.lot_number, l.rice_type, l.no_of_bags, l.bag_weight, l.total_weight,
             l.bill_weight, l.received_weight, l.rate, l.amount, l.inward_slip_pass_created_at
      FROM inward_slip_lots l
      INNER JOIN kaantas k ON k.sauda_id = l.sauda_id AND l.lot_number = 'LOT-' || k.kaanta_id
      WHERE k.sauda_id = $1 AND k.inward_slip_pass_id = $2
    `;
    if (godownId) {
      lotsQuery += ` AND l.godown_id = $3 AND k.godown_id = $3`;
      lotsParams.push(godownId);
    }
    lotsQuery += ` ORDER BY l.lot_number`;
    const lotsResult = await db.query(lotsQuery, lotsParams);

    const header: KaantaIspDetailHeader = {
      id: isp.id,
      slip_number: isp.slip_number,
      date: isp.date instanceof Date ? isp.date.toISOString().split('T')[0] : String(isp.date).split('T')[0],
      vehicle_number: isp.vehicle_number,
      party_name: isp.party_name,
      transporter_id: isp.transporter_id,
      transportation_cost: isp.transportation_cost != null ? parseFloat(String(isp.transportation_cost)) : null,
      godown_id: isp.godown_id,
    };

    const kaantas: KaantaPurchaseKaantaRow[] = kaResult.rows.map((k: Record<string, unknown>) => ({
      id: k.id as string,
      kaanta_id: k.kaanta_id as string,
      full_truck_weight: parseFloat(String(k.full_truck_weight)),
      empty_truck_weight: parseFloat(String(k.empty_truck_weight)),
      kaanta_weight: k.kaanta_weight != null ? parseFloat(String(k.kaanta_weight)) : null,
      said_sent_weight: k.said_sent_weight != null ? parseFloat(String(k.said_sent_weight)) : null,
      bag_weight: parseFloat(String(k.bag_weight)),
      no_of_bags: parseInt(String(k.no_of_bags), 10),
      bag_type: String(k.bag_type),
      khaali_kaanta_parchi_url: (k.khaali_kaanta_parchi_url as string) ?? null,
      bhara_kaanta_parchi_url: (k.bhara_kaanta_parchi_url as string) ?? null,
    }));

    const lots: KaantaPurchaseLotRow[] = lotsResult.rows.map((l: Record<string, unknown>) => ({
      id: l.id as string,
      lot_number: l.lot_number as string,
      rice_type: (l.rice_type as RiceType | null) ?? null,
      no_of_bags: parseInt(String(l.no_of_bags || '0'), 10),
      bag_weight: l.bag_weight != null ? parseFloat(String(l.bag_weight)) : null,
      total_weight: l.total_weight != null ? parseFloat(String(l.total_weight)) : null,
      bill_weight: parseFloat(String(l.bill_weight)),
      received_weight: parseFloat(String(l.received_weight)),
      rate: parseFloat(String(l.rate)),
      amount: l.amount != null ? parseFloat(String(l.amount)) : null,
      inward_slip_pass_created_at: l.inward_slip_pass_created_at
        ? new Date(l.inward_slip_pass_created_at as string | Date).toISOString()
        : null,
    }));

    logger.info('Kaanta purchase ISP detail retrieved', { saudaId, ispId, kaantaCount: kaantas.length });

    return { isp: header, kaantas, lots };
  }

  /**
   * Purchase saudas for this broker: computed broker_commission_amount per sauda (via getSaudaSummary)
   * and sum. Optional godown_id scopes lots/ISPs like GET /purchase-summary/sauda/:id?godown_id=
   */
  async getBrokerCommissionSummary(
    brokerId: string,
    options?: {
      godownId?: string;
      status?: string;
      fromDate?: string;
      toDate?: string;
    }
  ): Promise<BrokerCommissionSummary> {
    const conditions: string[] = ['broker_id = $1'];
    const params: unknown[] = [brokerId];
    let n = 2;

    if (options?.status) {
      conditions.push(`status = $${n++}`);
      params.push(options.status);
    }
    if (options?.fromDate) {
      conditions.push(`sauda_date >= $${n++}::date`);
      params.push(options.fromDate);
    }
    if (options?.toDate) {
      conditions.push(`sauda_date <= $${n++}::date`);
      params.push(options.toDate);
    }

    const listQuery = `
      SELECT id, sauda_date, status
      FROM saudas
      WHERE ${conditions.join(' AND ')}
      ORDER BY sauda_date DESC NULLS LAST, created_at DESC
    `;
    const listResult = await db.query<{ id: string; sauda_date: Date | null; status: string }>(listQuery, params);
    const rows = listResult.rows;

    const lines: BrokerCommissionSummaryLine[] = [];
    let totalBrokerCommission = 0;

    for (const row of rows) {
      const summary = await this.getSaudaSummary(row.id, options?.godownId);
      const details = summary.sauda_details;
      const saudaDateStr =
        row.sauda_date instanceof Date
          ? row.sauda_date.toISOString().split('T')[0]
          : row.sauda_date
            ? String(row.sauda_date).split('T')[0]
            : null;

      lines.push({
        sauda_id: row.id,
        sauda_display_id: summary.sauda_display_id ?? formatSaudaDisplayId(row.id),
        sauda_date: saudaDateStr,
        status: details?.status ?? row.status,
        broker_commission: details?.broker_commission ?? null,
        broker_commission_type: details?.broker_commission_type ?? 'percentage',
        amount_after_discount: summary.amount_after_discount,
        broker_commission_amount: summary.broker_commission_amount,
      });
      totalBrokerCommission += summary.broker_commission_amount;
    }

    logger.info('Broker commission summary calculated', { brokerId, saudaCount: lines.length, totalBrokerCommission });

    return {
      broker_id: brokerId,
      lines,
      total_broker_commission: floorToMoneyStep(totalBrokerCommission),
    };
  }
}

export const purchaseSummaryDAO = new PurchaseSummaryDAO();

