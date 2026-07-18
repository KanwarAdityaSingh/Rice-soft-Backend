import { RiceType } from './lead.model';
import type { RiceCategory } from '../constants/rice-categories';

export interface PurchaseSummary {
  // Identifiers
  sauda_id?: string;
  /** Short label for UI (4 hex chars); set when sauda_id is present */
  sauda_display_id?: string;
  inward_slip_pass_id?: string;
  /** Indian FY label derived from sauda/ISP date (e.g. 2025-2026). */
  financial_year?: string | null;
  calculation_policy_id?: string | null;
  
  // Separate Fields - Step by Step Breakdown (Vendor POV)
  total_lots: number;
  total_bags: number;
  total_weight: number; // Sum of received_weight from all lots
  
  // Step 1: Base calculation
  base_amount: number; // Sum of lot amounts (received_weight × rate), or gross kaanta weight × rate
  
  // Step 1b: Dana (when kaanta + is_dana_required)
  dana_deduction_kg?: number;
  dana_deduction_amount?: number;
  amount_after_dana?: number; // base_amount - dana_deduction_amount
  
  // Step 2: Cash discount (% applied to base_amount; rupees = fixed sauda amount)
  cash_discount_amount: number;
  amount_after_discount: number; // amount_after_dana - cash_discount
  
  // Step 3: Broker commission (deducted from vendor payable)
  broker_commission_amount: number;
  amount_after_commission: number; // amount_after_discount - broker_commission (error if commission is larger)
  
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
  display_id: string;
  sauda_type: string;
  rice_category: RiceCategory;
  rice_type: RiceType;
  rice_length_id: string | null;
  rice_length_name: string | null;
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
  sauda_display_id: string;
  rice_type: RiceType | null;
  no_of_bags: number;
  bag_weight: number | null;
  total_weight: number | null;
  bill_weight: number;
  received_weight: number;
  rate: number;
  amount: number | null;
  /** ISO timestamp from lot.inward_slip_pass_created_at when set */
  inward_slip_pass_created_at: string | null;
}

export interface SaudaBreakdown {
  sauda_id: string;
  sauda_display_id: string;
  sauda_details: SaudaSummaryDetails;
  total_lots: number;
  total_bags: number;
  total_weight: number;
  base_amount: number;
  dana_deduction_kg?: number;
  dana_deduction_amount?: number;
  amount_after_dana?: number;
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

/** Vendor (purchaser) on the sauda — for broker-facing statement context. */
export interface BrokerCommissionParty {
  purchaser_id: string;
  business_name: string | null;
  gst_number: string | null;
}

/** Payment advice rows linked to the sauda or to any ISP on that sauda (deduped by id per line). */
export interface BrokerCommissionPaymentAdviceRow {
  id: string;
  sr_number: string | null;
  amount: number;
  date_of_payment: string;
  status: string;
  sauda_id: string | null;
  inward_slip_pass_id: string | null;
}

/** Per purchase sauda: computed broker commission (same rules as GET /purchase-summary/sauda/:id). */
export interface BrokerCommissionSummaryLine {
  sauda_id: string;
  sauda_display_id: string;
  sauda_date: string | null;
  status: string;
  broker_commission: number | null;
  broker_commission_type: string;
  amount_after_discount: number;
  broker_commission_amount: number;
  party: BrokerCommissionParty;
  isps: IspSummaryDetails[];
  payment_advices: BrokerCommissionPaymentAdviceRow[];
}

export interface BrokerCommissionSummary {
  broker_id: string;
  lines: BrokerCommissionSummaryLine[];
  total_broker_commission: number;
  /** Echo of `from_date` query filter when provided (YYYY-MM-DD). */
  period_from?: string | null;
  /** Echo of `to_date` query filter when provided (YYYY-MM-DD). */
  period_to?: string | null;
}

/** Kaanta-only purchase overview (no sauda object in response). */
export interface KaantaMetricSummary {
  total_isps: number;
  total_kaantas: number;
  total_lots: number;
  total_bags: number;
  total_weight_kg: number;
  base_amount: number;
  dana_deduction_kg?: number;
  dana_deduction_amount?: number;
  amount_after_dana?: number;
  cash_discount_amount: number;
  amount_after_discount: number;
  broker_commission_amount: number;
  amount_after_commission: number;
  transportation_cost: number;
  amount_after_transportation: number;
  net_payable: number;
}

export interface KaantaIspOverviewRow {
  id: string;
  slip_number: string;
  date: string;
  vehicle_number: string | null;
  party_name: string;
  transporter_id: string | null;
  transportation_cost: number | null;
  kaanta_count: number;
  lot_count: number;
}

export interface KaantaPurchaseOverview {
  summary: KaantaMetricSummary;
  isps: KaantaIspOverviewRow[];
}

export interface KaantaIspDetailHeader {
  id: string;
  slip_number: string;
  date: string;
  vehicle_number: string | null;
  party_name: string;
  transporter_id: string | null;
  transportation_cost: number | null;
  godown_id: string;
}

/** Kaanta row in purchase drill-down (no sauda_id / inward_slip_pass_id in response). */
export interface KaantaPurchaseKaantaRow {
  id: string;
  kaanta_id: string;
  full_truck_weight: number;
  empty_truck_weight: number;
  kaanta_weight: number | null;
  said_sent_weight: number | null;
  bag_weight: number;
  no_of_bags: number;
  bag_type: string;
  khaali_kaanta_parchi_url: string | null;
  bhara_kaanta_parchi_url: string | null;
}

export interface KaantaPurchaseLotRow {
  id: string;
  lot_number: string;
  rice_type: RiceType | null;
  no_of_bags: number;
  bag_weight: number | null;
  total_weight: number | null;
  bill_weight: number;
  received_weight: number;
  rate: number;
  amount: number | null;
  inward_slip_pass_created_at: string | null;
}

export interface KaantaPurchaseIspDetail {
  isp: KaantaIspDetailHeader;
  kaantas: KaantaPurchaseKaantaRow[];
  lots: KaantaPurchaseLotRow[];
}

