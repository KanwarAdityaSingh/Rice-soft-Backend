import { db } from '../database/connection';
import { 
  PurchaseSummary, 
  GetSummaryOptions,
  SaudaSummaryDetails,
  IspSummaryDetails,
  LotSummaryDetails,
  SaudaBreakdown
} from '../models/purchase-summary.model';
import { logger } from '../utils/logger';

export class PurchaseSummaryDAO {
  /**
   * Get purchase summary for a single sauda
   * Aggregates all lots and applies sauda-level discounts/commissions
   */
  async getSaudaSummary(saudaId: string, options: GetSummaryOptions = {}): Promise<PurchaseSummary> {
    const igstPercentage = options.igst_percentage || 0;

    // Get sauda details
    const saudaQuery = `
      SELECT id, sauda_type, rice_type, rice_code_id, rate, broker_id, 
             broker_commission, broker_commission_type, cash_discount, cash_discount_type,
             quantity, purchaser_id, status
      FROM saudas
      WHERE id = $1
    `;
    const saudaResult = await db.query(saudaQuery, [saudaId]);
    
    if (saudaResult.rows.length === 0) {
      throw new Error('Sauda not found');
    }
    
    const sauda = saudaResult.rows[0];

    // Get all lots for this sauda
    const lotsQuery = `
      SELECT id, lot_number, sauda_id, rice_type, no_of_bags, bag_weight, total_weight,
             bill_weight, received_weight, rate, amount
      FROM inward_slip_lots
      WHERE sauda_id = $1
      ORDER BY lot_number
    `;
    const lotsResult = await db.query(lotsQuery, [saudaId]);
    const lots = lotsResult.rows;

    // Get ISPs linked to this sauda (via kaantas)
    const ispQuery = `
      SELECT DISTINCT isp.id, isp.slip_number, isp.date, isp.vehicle_number, 
             isp.party_name, isp.transporter_id, isp.transportation_cost
      FROM inward_slip_passes isp
      INNER JOIN kaantas k ON k.inward_slip_pass_id = isp.id
      WHERE k.sauda_id = $1
      ORDER BY isp.date DESC
    `;
    const ispResult = await db.query(ispQuery, [saudaId]);
    const isps = ispResult.rows;

    // Calculate totals
    const totalLots = lots.length;
    const totalBags = lots.reduce((sum, lot) => sum + parseInt(lot.no_of_bags || '0', 10), 0);
    const totalWeight = lots.reduce((sum, lot) => sum + parseFloat(lot.received_weight || '0'), 0);
    const baseAmount = lots.reduce((sum, lot) => sum + parseFloat(lot.amount || '0'), 0);

    // Step 2: Calculate cash discount
    let cashDiscountAmount = 0;
    const cashDiscount = parseFloat(sauda.cash_discount || '0');
    const cashDiscountType = sauda.cash_discount_type || 'rupees';
    
    if (cashDiscount > 0) {
      if (cashDiscountType === 'percentage') {
        cashDiscountAmount = baseAmount * (cashDiscount / 100);
      } else {
        cashDiscountAmount = cashDiscount;
      }
    }
    
    const amountAfterDiscount = baseAmount - cashDiscountAmount;

    // Step 3: Calculate broker commission
    let brokerCommissionAmount = 0;
    const brokerCommission = parseFloat(sauda.broker_commission || '0');
    const brokerCommissionType = sauda.broker_commission_type || 'percentage';
    
    if (brokerCommission > 0) {
      if (brokerCommissionType === 'percentage') {
        brokerCommissionAmount = amountAfterDiscount * (brokerCommission / 100);
      } else if (brokerCommissionType === 'weight') {
        brokerCommissionAmount = brokerCommission * totalWeight;
      } else {
        // rupees
        brokerCommissionAmount = brokerCommission;
      }
    }
    
    const amountAfterCommission = amountAfterDiscount + brokerCommissionAmount;

    // Step 4: Calculate transportation cost
    const transportationCost = isps.reduce((sum, isp) => sum + parseFloat(isp.transportation_cost || '0'), 0);
    const amountAfterTransportation = amountAfterCommission + transportationCost;

    // Step 5: Calculate IGST
    const igstAmount = amountAfterTransportation * (igstPercentage / 100);
    const finalTotalAmount = amountAfterTransportation + igstAmount;

    // Format lot details
    const lotDetails: LotSummaryDetails[] = lots.map(lot => ({
      id: lot.id,
      lot_number: lot.lot_number,
      sauda_id: lot.sauda_id,
      rice_type: lot.rice_type,
      no_of_bags: parseInt(lot.no_of_bags || '0', 10),
      bag_weight: lot.bag_weight ? parseFloat(lot.bag_weight) : null,
      total_weight: lot.total_weight ? parseFloat(lot.total_weight) : null,
      bill_weight: parseFloat(lot.bill_weight),
      received_weight: parseFloat(lot.received_weight),
      rate: parseFloat(lot.rate),
      amount: lot.amount ? parseFloat(lot.amount) : null,
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
      sauda_type: sauda.sauda_type,
      rice_type: sauda.rice_type,
      rice_code_id: sauda.rice_code_id,
      rate: parseFloat(sauda.rate),
      broker_id: sauda.broker_id,
      broker_commission: sauda.broker_commission ? parseFloat(sauda.broker_commission) : null,
      broker_commission_type: sauda.broker_commission_type,
      cash_discount: sauda.cash_discount ? parseFloat(sauda.cash_discount) : null,
      cash_discount_type: sauda.cash_discount_type,
      quantity: sauda.quantity ? parseFloat(sauda.quantity) : null,
      purchaser_id: sauda.purchaser_id,
      status: sauda.status,
    };

    logger.info('Sauda summary calculated', { saudaId, finalTotalAmount });

    return {
      sauda_id: saudaId,
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
  async getIspSummary(ispId: string, options: GetSummaryOptions = {}): Promise<PurchaseSummary> {
    const igstPercentage = options.igst_percentage || 0;

    // Get ISP details
    const ispQuery = `
      SELECT id, slip_number, date, vehicle_number, party_name, 
             transporter_id, transportation_cost
      FROM inward_slip_passes
      WHERE id = $1
    `;
    const ispResult = await db.query(ispQuery, [ispId]);
    
    if (ispResult.rows.length === 0) {
      throw new Error('Inward slip pass not found');
    }
    
    const isp = ispResult.rows[0];

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
      const saudaSummary = await this.getSaudaSummary(saudaId, options);
      
      const breakdown: SaudaBreakdown = {
        sauda_id: saudaId,
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

    return {
      inward_slip_pass_id: ispId,
      total_lots: totalLots,
      total_bags: totalBags,
      total_weight: totalWeight,
      base_amount: totalBaseAmount,
      cash_discount_amount: totalCashDiscountAmount,
      amount_after_discount: totalAmountAfterDiscount,
      broker_commission_amount: totalBrokerCommissionAmount,
      amount_after_commission: totalAmountAfterCommission,
      transportation_cost: totalTransportationCost,
      amount_after_transportation: totalAmountAfterTransportation,
      igst_amount: totalIgstAmount,
      igst_percentage: igstPercentage,
      final_total_amount: totalFinalAmount,
      net_payable: totalFinalAmount,
      isp_details: [ispDetails],
      saudas: saudaBreakdowns,
    };
  }
}

export const purchaseSummaryDAO = new PurchaseSummaryDAO();

