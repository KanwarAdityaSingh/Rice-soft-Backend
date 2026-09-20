import type { BrokerCommissionType } from './sauda.model';

export type BrokerCommissionEntryType = 'accrual' | 'reversal';
export type BrokerCommissionEntryStatus = 'pending' | 'approved' | 'paid';

export interface BrokerCommissionEntry {
  id: string;
  broker_id: string;
  sales_sauda_id: string;
  invoice_dispatch_id: string | null;
  credit_note_id: string | null;
  entry_type: BrokerCommissionEntryType;
  commission_type: BrokerCommissionType;
  commission_rate: number;
  basis_quantity: number;
  basis_sale_amount: number;
  commission_amount: number;
  status: BrokerCommissionEntryStatus;
  approved_at: Date | null;
  approved_by: string | null;
  paid_at: Date | null;
  paid_by: string | null;
  notes: string | null;
  created_at: Date;
  created_by: string | null;
  updated_at: Date;
  /** Joined */
  broker_name?: string | null;
  order_number?: string | null;
  invoice_number?: string | null;
  credit_note_number?: string | null;
  party_name?: string | null;
}

export interface CreateBrokerCommissionEntryDTO {
  broker_id: string;
  sales_sauda_id: string;
  invoice_dispatch_id?: string | null;
  credit_note_id?: string | null;
  entry_type: BrokerCommissionEntryType;
  commission_type: BrokerCommissionType;
  commission_rate: number;
  basis_quantity: number;
  basis_sale_amount: number;
  commission_amount: number;
  status?: BrokerCommissionEntryStatus;
  notes?: string | null;
  created_by?: string | null;
}

/** Sales line in combined broker commission summary */
export interface SalesBrokerCommissionSummaryLine {
  entry_id: string;
  sales_sauda_id: string;
  order_number: string | null;
  invoice_dispatch_id: string | null;
  invoice_number: string | null;
  credit_note_id: string | null;
  credit_note_number: string | null;
  entry_type: BrokerCommissionEntryType;
  broker_commission: number;
  broker_commission_type: BrokerCommissionType;
  basis_quantity: number;
  basis_sale_amount: number;
  broker_commission_amount: number;
  status: BrokerCommissionEntryStatus;
  party_name: string | null;
  created_at: string;
}
