export type CashDiscountType = 'rupees' | 'percentage';
export type BrokerCommissionType = 'rupees' | 'percentage';

export interface Purchase {
  id: string;
  vendor_id: string;
  broker_id: string | null;
  broker_commission: number | null;
  broker_commission_type: BrokerCommissionType;
  payment_advice_id: string | null;
  cash_discount: number | null;
  cash_discount_type: CashDiscountType;
  transportation_cost: number | null;
  invoice_number: string | null;
  invoice_date: Date | null;
  rate: number;
  total_weight: number | null;
  total_amount: number | null;
  igst_amount: number | null;
  igst_percentage: number | null;
  freight_status: string | null;
  truck_number: string | null;
  transport_name: string | null;
  goods_dispatched_from: string | null;
  goods_dispatched_to: string | null;
  purchase_date: Date;
  expected_quantity: number | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreatePurchaseDTO {
  vendor_id: string;
  sauda_ids?: string[];
  inward_slip_pass_ids?: string[];
  lot_ids?: string[];
  broker_id?: string;
  broker_commission?: number;
  broker_commission_type?: BrokerCommissionType;
  cash_discount?: number;
  cash_discount_type?: CashDiscountType;
  transportation_cost?: number;
  invoice_number?: string;
  invoice_date?: string;
  rate?: number;
  total_weight?: number;
  total_amount?: number;
  igst_amount?: number;
  igst_percentage?: number;
  freight_status?: string;
  truck_number?: string;
  transport_name?: string;
  goods_dispatched_from?: string;
  goods_dispatched_to?: string;
  purchase_date: string;
  expected_quantity?: number;
  notes?: string;
  created_by?: string;
}

export interface UpdatePurchaseDTO {
  broker_id?: string;
  broker_commission?: number;
  broker_commission_type?: BrokerCommissionType;
  payment_advice_id?: string | null;
  cash_discount?: number;
  cash_discount_type?: CashDiscountType;
  transportation_cost?: number;
  invoice_number?: string;
  invoice_date?: string;
  rate?: number;
  total_weight?: number;
  total_amount?: number;
  igst_amount?: number;
  igst_percentage?: number;
  freight_status?: string;
  truck_number?: string;
  transport_name?: string;
  goods_dispatched_from?: string;
  goods_dispatched_to?: string;
  purchase_date?: string;
  expected_quantity?: number;
  notes?: string;
  updated_by?: string;
}

export interface PurchaseResponse {
  id: string;
  vendor_id: string;
  broker_id: string | null;
  broker_commission: number | null;
  broker_commission_type: BrokerCommissionType;
  payment_advice_id: string | null;
  cash_discount: number | null;
  cash_discount_type: CashDiscountType;
  transportation_cost: number | null;
  invoice_number: string | null;
  invoice_date: string | null;
  rate: number;
  total_weight: number | null;
  total_amount: number | null;
  igst_amount: number | null;
  igst_percentage: number | null;
  freight_status: string | null;
  truck_number: string | null;
  transport_name: string | null;
  goods_dispatched_from: string | null;
  goods_dispatched_to: string | null;
  purchase_date: string;
  expected_quantity: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

