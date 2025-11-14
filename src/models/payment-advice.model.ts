import { CreatePaymentAdviceChargeDTO, PaymentAdviceChargeResponse } from './payment-advice-charge.model';

export type PaymentAdviceStatus = 'pending' | 'completed' | 'failed';

export interface PaymentAdvice {
  id: string;
  purchase_id: string | null;
  payer_id: string;
  recipient_id: string;
  sr_number: string | null;
  party_name: string | null;
  party_address: string | null;
  broker_name: string | null;
  invoice_number: string | null;
  invoice_date: Date | null;
  truck_number: string | null;
  item: string | null;
  total_bags: number | null;
  due_date: Date | null;
  bill_weight: number | null;
  kanta_weight: number | null;
  final_weight: number | null;
  rate: number | null;
  amount: number;
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
  purchase_id?: string;
  payer_id: string;
  recipient_id: string;
  sr_number?: string;
  party_name?: string;
  party_address?: string;
  broker_name?: string;
  invoice_number?: string;
  invoice_date?: string;
  truck_number?: string;
  item?: string;
  total_bags?: number;
  due_date?: string;
  bill_weight?: number;
  kanta_weight?: number;
  final_weight?: number;
  rate?: number;
  amount: number;
  transaction_id?: string;
  date_of_payment: string;
  status?: PaymentAdviceStatus;
  payment_slip_image_url?: string;
  notes?: string;
  charges?: CreatePaymentAdviceChargeDTO[];
  created_by?: string;
}

export interface UpdatePaymentAdviceDTO {
  purchase_id?: string;
  payer_id?: string;
  recipient_id?: string;
  sr_number?: string;
  party_name?: string;
  party_address?: string;
  broker_name?: string;
  invoice_number?: string;
  invoice_date?: string;
  truck_number?: string;
  item?: string;
  total_bags?: number;
  due_date?: string;
  bill_weight?: number;
  kanta_weight?: number;
  final_weight?: number;
  rate?: number;
  amount?: number;
  transaction_id?: string;
  date_of_payment?: string;
  status?: PaymentAdviceStatus;
  payment_slip_image_url?: string;
  notes?: string;
  updated_by?: string;
}

export interface PaymentAdviceResponse {
  id: string;
  purchase_id: string | null;
  payer_id: string;
  recipient_id: string;
  sr_number: string | null;
  party_name: string | null;
  party_address: string | null;
  broker_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  truck_number: string | null;
  item: string | null;
  total_bags: number | null;
  due_date: string | null;
  bill_weight: number | null;
  kanta_weight: number | null;
  final_weight: number | null;
  rate: number | null;
  amount: number;
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

