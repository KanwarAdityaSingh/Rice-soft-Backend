export type ChargeType = 'percentage' | 'fixed';

export interface PaymentAdviceCharge {
  id: string;
  payment_advice_id: string;
  charge_name: string;
  charge_value: number;
  charge_type: ChargeType | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreatePaymentAdviceChargeDTO {
  charge_name: string;
  charge_value: number;
  charge_type?: ChargeType;
}

export interface UpdatePaymentAdviceChargeDTO {
  charge_name?: string;
  charge_value?: number;
  charge_type?: ChargeType;
}

export interface PaymentAdviceChargeResponse {
  id: string;
  payment_advice_id: string;
  charge_name: string;
  charge_value: number;
  charge_type: ChargeType | null;
  created_at: string;
  updated_at: string;
}

