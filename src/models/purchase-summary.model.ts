import { RiceType } from './lead.model';

export interface PurchaseSummary {
  // Identifiers
  sauda_id?: string;
  inward_slip_pass_id?: string;
  
  // Separate Fields - Step by Step Breakdown (Vendor POV)
  total_lots: number;
  total_bags: number;
  total_weight: number; // Sum of received_weight from all lots
  
  // Step 1: Base calculation
  base_amount: number; // Sum of lot amounts (received_weight × rate)
  
  // Step 2: Cash discount
  cash_discount_amount: number;
  amount_after_discount: number; // base_amount - cash_discount
  
  // Step 3: Broker commission
  broker_commission_amount: number;
  amount_after_commission: number; // amount_after_discount + broker_commission
  
  // Step 4: Transportation
  transportation_cost: number; // Sum from linked ISPs
  amount_after_transportation: number; // amount_after_commission + transportation_cost
  
  // Step 5: IGST (removed - always 0)
  igst_amount: number; // Always 0
  igst_percentage: number; // Always 0
  final_total_amount: number; // amount_after_transportation (IGST removed)
  
  // Aggregated Summary
  net_payable: number; // Same as final_total_amount (before payment advice charges)
  
  // Metadata
  sauda_details?: SaudaSummaryDetails;
  isp_details?: IspSummaryDetails[];
  lot_details?: LotSummaryDetails[];
  
  // For ISP summary with multiple saudas
  saudas?: SaudaBreakdown[];
}

export interface SaudaSummaryDetails {
  id: string;
  sauda_type: string;
  rice_type: RiceType;
  rice_code_id: string | null;
  rate: number;
  broker_id: string | null;
  broker_commission: number | null;
  broker_commission_type: string;
  cash_discount: number | null;
  cash_discount_type: string;
  quantity: number | null;
  received_until_now: number;
  completion_percentage: number | null;
  purchaser_id: string;
  status: string;
}

export interface IspSummaryDetails {
  id: string;
  slip_number: string;
  date: string;
  vehicle_number: string;
  party_name: string;
  transporter_id: string | null;
  transportation_cost: number | null;
}

export interface LotSummaryDetails {
  id: string;
  lot_number: string;
  sauda_id: string;
  rice_type: RiceType | null;
  no_of_bags: number;
  bag_weight: number | null;
  total_weight: number | null;
  bill_weight: number;
  received_weight: number;
  rate: number;
  amount: number | null;
}

export interface SaudaBreakdown {
  sauda_id: string;
  sauda_details: SaudaSummaryDetails;
  total_lots: number;
  total_bags: number;
  total_weight: number;
  base_amount: number;
  cash_discount_amount: number;
  amount_after_discount: number;
  broker_commission_amount: number;
  amount_after_commission: number;
  transportation_cost: number;
  amount_after_transportation: number;
  igst_amount: number;
  final_total_amount: number;
  lot_details: LotSummaryDetails[];
}

export interface GetSummaryOptions {
  // IGST removed - this interface kept for backward compatibility but igst_percentage is ignored
}

