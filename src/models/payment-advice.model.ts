import { CreatePaymentAdviceChargeDTO, PaymentAdviceChargeResponse } from './payment-advice-charge.model';
import type { PurchaseSummary } from './purchase-summary.model';
import type { CalculationPolicyId } from '../constants/calculation-policies';

export type PaymentAdviceStatus = 'pending' | 'completed' | 'failed';

export interface PaymentAdvice {
  id: string;
  sauda_id: string | null;
  inward_slip_pass_id: string | null;
  payer_id: string | null;
  recipient_id: string | null;
  sr_number: string | null;
  party_name: string | null;
  party_address: string | null;
  broker_name: string | null;
  invoice_number: string | null;
  invoice_date: Date | null;
  bill_number: string | null;
  truck_number: string | null;
  item: string | null;
  total_bags: number | null;
  due_date: Date | null;
  bill_weight: number | null;
  kanta_weight: number | null;
  dana_deduction: number | null;
  final_weight: number | null;
  rate: number | null;
  amount: number;
  financial_year: string | null;
  calculation_policy_id: CalculationPolicyId | string | null;
  transaction_id: string | null;
  date_of_payment: Date;
  status: PaymentAdviceStatus;
  payment_slip_image_url: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreatePaymentAdviceDTO {
  sauda_id?: string;
  inward_slip_pass_id?: string;
  payer_id?: string;
  recipient_id?: string;
  sr_number?: string;
  party_name?: string;
  party_address?: string;
  broker_name?: string;
  invoice_number?: string;
  invoice_date?: string;
  bill_number?: string;
  truck_number?: string;
  item?: string;
  total_bags?: number;
  due_date?: string;
  bill_weight?: number;
  kanta_weight?: number;
  dana_deduction?: number;
  final_weight?: number;
  rate?: number;
  amount: number;
  financial_year?: string | null;
  calculation_policy_id?: CalculationPolicyId | null;
  transaction_id?: string;
  date_of_payment: string;
  status?: PaymentAdviceStatus;
  payment_slip_image_url?: string;
  notes?: string;
  charges?: CreatePaymentAdviceChargeDTO[];
  created_by?: string;
}

export interface UpdatePaymentAdviceDTO {
  sauda_id?: string;
  inward_slip_pass_id?: string;
  payer_id?: string;
  recipient_id?: string;
  sr_number?: string;
  party_name?: string;
  party_address?: string;
  broker_name?: string;
  invoice_number?: string;
  invoice_date?: string;
  bill_number?: string;
  truck_number?: string;
  item?: string;
  total_bags?: number;
  due_date?: string;
  bill_weight?: number;
  kanta_weight?: number;
  dana_deduction?: number;
  final_weight?: number;
  rate?: number;
  amount?: number;
  financial_year?: string | null;
  calculation_policy_id?: CalculationPolicyId | null;
  transaction_id?: string;
  date_of_payment?: string;
  status?: PaymentAdviceStatus;
  payment_slip_image_url?: string;
  notes?: string;
  updated_by?: string;
  /** When provided, replaces all charges for this payment advice (same shape as create). */
  charges?: CreatePaymentAdviceChargeDTO[];
}

export interface PaymentAdviceResponse {
  id: string;
  sauda_id: string | null;
  inward_slip_pass_id: string | null;
  payer_id: string | null;
  recipient_id: string | null;
  sr_number: string | null;
  party_name: string | null;
  party_address: string | null;
  broker_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  bill_number: string | null;
  truck_number: string | null;
  item: string | null;
  total_bags: number | null;
  due_date: string | null;
  bill_weight: number | null;
  kanta_weight: number | null;
  dana_deduction: number | null;
  final_weight: number | null;
  rate: number | null;
  amount: number;
  financial_year: string | null;
  calculation_policy_id: CalculationPolicyId | string | null;
  transaction_id: string | null;
  date_of_payment: string;
  status: PaymentAdviceStatus;
  payment_slip_image_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  charges?: PaymentAdviceChargeResponse[];
  net_payable?: number;
}

/** Consolidated payload for PA create/edit preview (same rules as save). */
export interface PaymentAdvicePreviewResponse {
  sauda_id: string | null;
  inward_slip_pass_id: string | null;
  bill_weight: number | null;
  kanta_weight: number | null;
  dana_deduction: number | null;
  final_weight: number | null;
  total_bags: number;
  total_weight: number;
  /** Floored purchase-summary final_total_amount (PA amount before charges). */
  amount: number;
  total_charges: number;
  /** amount − total_charges, floored to whole rupees. */
  net_payable: number;
  financial_year: string | null;
  calculation_policy_id: CalculationPolicyId | string | null;
  summary: PurchaseSummary;
}

