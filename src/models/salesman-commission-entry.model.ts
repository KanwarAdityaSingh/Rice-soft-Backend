import type {
  SalesmanCommissionConfig,
  SalesmanCommissionType,
} from '../constants/salesman-commission-types';

export type SalesmanCommissionEntryType = 'accrual' | 'reversal';
export type SalesmanCommissionEntryStatus = 'pending' | 'approved' | 'paid';

export interface SalesmanCommissionEntry {
  id: string;
  salesman_id: string;
  sales_sauda_id: string;
  invoice_dispatch_id: string | null;
  credit_note_id: string | null;
  entry_type: SalesmanCommissionEntryType;
  commission_type: SalesmanCommissionType;
  commission_config: SalesmanCommissionConfig;
  basis_quantity: number;
  basis_sale_amount: number;
  commission_amount: number;
  status: SalesmanCommissionEntryStatus;
  approved_at: Date | null;
  approved_by: string | null;
  paid_at: Date | null;
  paid_by: string | null;
  notes: string | null;
  created_at: Date;
  created_by: string | null;
  updated_at: Date;
  /** Joined */
  salesman_name?: string | null;
  order_number?: string | null;
  invoice_number?: string | null;
  credit_note_number?: string | null;
  party_name?: string | null;
}

export interface CreateSalesmanCommissionEntryDTO {
  salesman_id: string;
  sales_sauda_id: string;
  invoice_dispatch_id?: string | null;
  credit_note_id?: string | null;
  entry_type: SalesmanCommissionEntryType;
  commission_type: SalesmanCommissionType;
  commission_config: SalesmanCommissionConfig;
  basis_quantity: number;
  basis_sale_amount: number;
  commission_amount: number;
  status?: SalesmanCommissionEntryStatus;
  notes?: string | null;
  created_by?: string | null;
}

export interface SalesmanCommissionEntryResponse {
  id: string;
  salesman_id: string;
  salesman_name: string | null;
  sales_sauda_id: string;
  invoice_dispatch_id: string | null;
  credit_note_id: string | null;
  entry_type: SalesmanCommissionEntryType;
  commission_type: SalesmanCommissionType;
  commission_config: SalesmanCommissionConfig;
  basis_quantity: number;
  basis_sale_amount: number;
  commission_amount: number;
  status: SalesmanCommissionEntryStatus;
  approved_at: string | null;
  approved_by: string | null;
  paid_at: string | null;
  paid_by: string | null;
  notes: string | null;
  order_number: string | null;
  invoice_number: string | null;
  credit_note_number: string | null;
  party_name: string | null;
  created_at: string;
  updated_at: string;
}
