import { db } from '../database/connection';

/**
 * Calculate purchase total amount from inward slip lots with all factors
 * @param saudaId - Sauda ID to get cash_discount, broker_commission, transportation_cost
 * @param purchaseBrokerCommission - Optional broker commission from purchase (overrides sauda)
 * @param igstPercentage - IGST percentage from purchase
 * @returns Object with calculated amounts
 */
export async function calculatePurchaseAmount(
  saudaId: string,
  purchaseBrokerCommission?: number | null,
  igstPercentage?: number | null
): Promise<{
  baseAmount: number;
  cashDiscount: number;
  amountAfterDiscount: number;
  brokerCommissionAmount: number;
  amountWithCommission: number;
  transportationCost: number;
  amountWithTransportation: number;
  igstAmount: number | null;
  finalTotalAmount: number;
  totalWeight: number;
  totalBags: number;
}> {
  // Get sauda details
  const saudaQuery = `
    SELECT id, sauda_type, cash_discount, broker_commission, transportation_cost
    FROM saudas
    WHERE id = $1
  `;
  const saudaResult = await db.query(saudaQuery, [saudaId]);
  
  if (saudaResult.rows.length === 0) {
    throw new Error(`Sauda not found: ${saudaId}`);
  }
  
  const sauda = saudaResult.rows[0];
  const cashDiscount = parseFloat(sauda.cash_discount || '0');
  const saudaBrokerCommission = parseFloat(sauda.broker_commission || '0');
  const transportationCost = parseFloat(sauda.transportation_cost || '0');
  const isXgodown = sauda.sauda_type === 'xgodown';
  
  // Get all inward slip passes for this sauda
  const inwardSlipPassesQuery = `
    SELECT id
    FROM inward_slip_passes
    WHERE sauda_id = $1
  `;
  const inwardSlipPassesResult = await db.query(inwardSlipPassesQuery, [saudaId]);
  
  // Get all lots from all inward slip passes
  let totalWeight = 0;
  let baseAmount = 0;
  let totalBags = 0;
  
  for (const slipPass of inwardSlipPassesResult.rows) {
    const lotsQuery = `
      SELECT 
        COALESCE(SUM(received_weight), 0) as total_received_weight,
        COALESCE(SUM(amount), 0) as total_amount,
        COALESCE(SUM(no_of_bags), 0) as total_bags
      FROM inward_slip_lots
      WHERE inward_slip_pass_id = $1
    `;
    const lotsResult = await db.query(lotsQuery, [slipPass.id]);
    
    if (lotsResult.rows.length > 0) {
      totalWeight += parseFloat(lotsResult.rows[0].total_received_weight || '0');
      baseAmount += parseFloat(lotsResult.rows[0].total_amount || '0');
      totalBags += parseInt(lotsResult.rows[0].total_bags || '0', 10);
    }
  }
  
  // Step 1: Base amount from inward slip lots
  let calculatedAmount = baseAmount;
  
  // Step 2: Subtract cash discount (fixed amount)
  const amountAfterDiscount = calculatedAmount - cashDiscount;
  calculatedAmount = amountAfterDiscount;
  
  // Step 3: Apply broker commission (percentage)
  // Use purchase.broker_commission if available, otherwise use sauda.broker_commission
  const brokerCommissionPercent = purchaseBrokerCommission 
    ? parseFloat(purchaseBrokerCommission.toString())
    : saudaBrokerCommission;
  
  let brokerCommissionAmount = 0;
  let amountWithCommission = calculatedAmount;
  if (brokerCommissionPercent > 0) {
    brokerCommissionAmount = calculatedAmount * (brokerCommissionPercent / 100);
    amountWithCommission = calculatedAmount + brokerCommissionAmount;
    calculatedAmount = amountWithCommission;
  }
  
  // Step 4: Add transportation cost (only for xgodown type)
  let amountWithTransportation = calculatedAmount;
  if (isXgodown && transportationCost > 0) {
    amountWithTransportation = calculatedAmount + transportationCost;
    calculatedAmount = amountWithTransportation;
  }
  
  // Step 5: Calculate IGST (percentage of final amount before IGST)
  let igstAmount: number | null = null;
  let finalTotalAmount = calculatedAmount;
  
  if (igstPercentage) {
    const igstPercent = parseFloat(igstPercentage.toString());
    igstAmount = calculatedAmount * (igstPercent / 100);
    finalTotalAmount = calculatedAmount + igstAmount;
  }
  
  return {
    baseAmount,
    cashDiscount,
    amountAfterDiscount,
    brokerCommissionAmount,
    amountWithCommission,
    transportationCost: isXgodown ? transportationCost : 0,
    amountWithTransportation,
    igstAmount,
    finalTotalAmount,
    totalWeight,
    totalBags
  };
}

