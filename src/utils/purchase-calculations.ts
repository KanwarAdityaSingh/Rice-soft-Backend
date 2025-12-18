import { db } from '../database/connection';

export type CashDiscountType = 'rupees' | 'percentage';
export type BrokerCommissionType = 'rupees' | 'percentage' | 'weight';

/**
 * Calculate purchase total amount from linked lots with Purchase-level accounting factors
 * @param purchaseId - Purchase ID to get linked lots
 * @param cashDiscount - Purchase-level cash discount (fixed amount or percentage based on cashDiscountType)
 * @param cashDiscountType - Type of cash discount: 'rupees' (fixed amount) or 'percentage'
 * @param brokerCommission - Purchase-level broker commission (fixed amount, percentage, or per-unit-weight based on brokerCommissionType)
 * @param brokerCommissionType - Type of broker commission: 'rupees' (fixed amount), 'percentage' (default), or 'weight' (per unit weight)
 * @param transportationCost - Purchase-level transportation cost (fixed amount)
 * @param igstPercentage - Purchase-level IGST percentage
 * @returns Object with calculated amounts
 */
export async function calculatePurchaseAmountFromLinkedLots(
  purchaseId: string,
  cashDiscount?: number | null,
  cashDiscountType?: CashDiscountType | null,
  brokerCommission?: number | null,
  brokerCommissionType?: BrokerCommissionType | null,
  transportationCost?: number | null,
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
  // Get all linked lots for this purchase
  const lotsQuery = `
    SELECT 
      COALESCE(SUM(l.received_weight), 0) as total_received_weight,
      COALESCE(SUM(l.amount), 0) as total_amount,
      COALESCE(SUM(l.no_of_bags), 0) as total_bags
    FROM purchase_lots pl
    INNER JOIN inward_slip_lots l ON pl.lot_id = l.id
    WHERE pl.purchase_id = $1
  `;
  const lotsResult = await db.query(lotsQuery, [purchaseId]);
  
  const totalWeight = parseFloat(lotsResult.rows[0]?.total_received_weight || '0');
  const baseAmount = parseFloat(lotsResult.rows[0]?.total_amount || '0');
  const totalBags = parseInt(lotsResult.rows[0]?.total_bags || '0', 10);
  
  // Step 1: Base amount from linked lots
  let calculatedAmount = baseAmount;
  
  // Step 2: Subtract cash discount (fixed amount or percentage based on type)
  let cashDiscountAmount = 0;
  const discountType = cashDiscountType || 'rupees';
  if (cashDiscount) {
    const discountValue = parseFloat(cashDiscount.toString());
    if (discountType === 'percentage') {
      // Calculate percentage of base amount
      cashDiscountAmount = calculatedAmount * (discountValue / 100);
    } else {
      // Fixed amount in rupees
      cashDiscountAmount = discountValue;
    }
  }
  const amountAfterDiscount = calculatedAmount - cashDiscountAmount;
  calculatedAmount = amountAfterDiscount;
  
  // Step 3: Apply broker commission (fixed amount, percentage, or weight-based)
  let brokerCommissionAmount = 0;
  let amountWithCommission = calculatedAmount;
  const commissionType = brokerCommissionType || 'percentage';
  if (brokerCommission) {
    const commissionValue = parseFloat(brokerCommission.toString());
    if (commissionValue > 0) {
      if (commissionType === 'percentage') {
        // Calculate percentage of amount after discount
        brokerCommissionAmount = calculatedAmount * (commissionValue / 100);
      } else if (commissionType === 'weight') {
        // Calculate commission based on total weight (commission per unit weight)
        brokerCommissionAmount = commissionValue * totalWeight;
      } else {
        // Fixed amount in rupees
        brokerCommissionAmount = commissionValue;
      }
      amountWithCommission = calculatedAmount + brokerCommissionAmount;
      calculatedAmount = amountWithCommission;
    }
  }
  
  // Step 4: Add transportation cost (fixed amount from Purchase)
  const transportationCostAmount = transportationCost ? parseFloat(transportationCost.toString()) : 0;
  let amountWithTransportation = calculatedAmount;
  if (transportationCostAmount > 0) {
    amountWithTransportation = calculatedAmount + transportationCostAmount;
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
    cashDiscount: cashDiscountAmount,
    amountAfterDiscount,
    brokerCommissionAmount,
    amountWithCommission,
    transportationCost: transportationCostAmount,
    amountWithTransportation,
    igstAmount,
    finalTotalAmount,
    totalWeight,
    totalBags
  };
}

/**
 * Legacy function - Calculate purchase total amount from sauda (kept for backward compatibility)
 * @deprecated Use calculatePurchaseAmountFromLinkedLots instead
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
    SELECT id, sauda_type, cash_discount, cash_discount_type, broker_commission, broker_commission_type
    FROM saudas
    WHERE id = $1
  `;
  const saudaResult = await db.query(saudaQuery, [saudaId]);
  
  if (saudaResult.rows.length === 0) {
    throw new Error(`Sauda not found: ${saudaId}`);
  }
  
  const sauda = saudaResult.rows[0];
  const cashDiscountValue = parseFloat(sauda.cash_discount || '0');
  const cashDiscountType: CashDiscountType = sauda.cash_discount_type || 'rupees';
  const saudaBrokerCommission = parseFloat(sauda.broker_commission || '0');
  const saudaBrokerCommissionType: BrokerCommissionType = sauda.broker_commission_type || 'percentage';
  const isXgodown = sauda.sauda_type === 'exgodown';
  
  // Get transportation cost from inward slip passes linked to this sauda
  // Sum all transportation costs from ISPs for this sauda (via junction table)
  const ispTransportQuery = `
    SELECT COALESCE(SUM(isp.transportation_cost), 0) as total_transportation_cost
    FROM inward_slip_passes isp
    INNER JOIN inward_slip_pass_saudas isps ON isp.id = isps.inward_slip_pass_id
    WHERE isps.sauda_id = $1 AND isp.transportation_cost IS NOT NULL
  `;
  const ispTransportResult = await db.query(ispTransportQuery, [saudaId]);
  const transportationCost = parseFloat(ispTransportResult.rows[0]?.total_transportation_cost || '0');
  
  // Get all lots for this sauda (now directly linked)
    const lotsQuery = `
      SELECT 
        COALESCE(SUM(received_weight), 0) as total_received_weight,
        COALESCE(SUM(amount), 0) as total_amount,
        COALESCE(SUM(no_of_bags), 0) as total_bags
      FROM inward_slip_lots
    WHERE sauda_id = $1
    `;
  const lotsResult = await db.query(lotsQuery, [saudaId]);
    
  const totalWeight = parseFloat(lotsResult.rows[0]?.total_received_weight || '0');
  const baseAmount = parseFloat(lotsResult.rows[0]?.total_amount || '0');
  const totalBags = parseInt(lotsResult.rows[0]?.total_bags || '0', 10);
  
  // Step 1: Base amount from lots
  let calculatedAmount = baseAmount;
  
  // Step 2: Subtract cash discount (fixed amount or percentage based on type)
  let cashDiscount = 0;
  if (cashDiscountValue > 0) {
    if (cashDiscountType === 'percentage') {
      // Calculate percentage of base amount
      cashDiscount = calculatedAmount * (cashDiscountValue / 100);
    } else {
      // Fixed amount in rupees
      cashDiscount = cashDiscountValue;
    }
  }
  const amountAfterDiscount = calculatedAmount - cashDiscount;
  calculatedAmount = amountAfterDiscount;
  
  // Step 3: Apply broker commission (fixed amount, percentage, or weight-based)
  const brokerCommissionValue = purchaseBrokerCommission 
    ? parseFloat(purchaseBrokerCommission.toString())
    : saudaBrokerCommission;
  
  let brokerCommissionAmount = 0;
  let amountWithCommission = calculatedAmount;
  if (brokerCommissionValue > 0) {
    if (saudaBrokerCommissionType === 'percentage') {
      // Calculate percentage of amount after discount
      brokerCommissionAmount = calculatedAmount * (brokerCommissionValue / 100);
    } else if (saudaBrokerCommissionType === 'weight') {
      // Calculate commission based on total weight (commission per unit weight)
      brokerCommissionAmount = brokerCommissionValue * totalWeight;
    } else {
      // Fixed amount in rupees
      brokerCommissionAmount = brokerCommissionValue;
    }
    amountWithCommission = calculatedAmount + brokerCommissionAmount;
    calculatedAmount = amountWithCommission;
  }
  
  // Step 4: Add transportation cost (only for exgodown type)
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

