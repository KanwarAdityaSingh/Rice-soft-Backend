export type ExpenseStatus = 'draft' | 'submitted' | 'approved' | 'paid' | 'rejected';
export type PayeeType = 'vendor' | 'broker' | 'transporter' | 'employee' | 'other';

export interface Expense {
  id: string;
  expense_category_id: string;
  expense_number: string;
  financial_year: string;
  serial_number: number;
  expense_date: Date;
  
  payee_type: PayeeType;
  payee_id: string | null;
  payee_name: string;
  payee_gst_number: string | null;
  payee_bank_name: string | null;
  payee_account_number: string | null;
  payee_ifsc: string | null;
  payee_branch: string | null;
  
  subtotal: number;
  overhead_total: number;
  taxable_amount: number | null;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  tax_amount: number;
  total_amount: number;
  
  status: ExpenseStatus;
  bill_pdf_url: string | null;
  payment_proof_url: string | null;
  notes: string | null;
  
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface ExpenseLine {
  id: string;
  expense_id: string;
  line_number: number;
  description: string;
  quantity: number | null;
  unit: string | null;
  rate: number | null;
  amount: number;
  reference_number: string | null;
  reference_date: Date | null;
  vehicle_number: string | null;
  from_location: string | null;
  to_location: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ExpenseOverhead {
  id: string;
  expense_id: string;
  charge_name: string;
  charge_amount: number;
  created_at: Date;
}

export interface ExpenseEntityLink {
  id: string;
  expense_id: string;
  entity_type: string;
  entity_id: string;
  created_at: Date;
}

export interface CreateExpenseDTO {
  expense_category_id: string;
  financial_year?: string;
  expense_date: string;
  
  payee_type: PayeeType;
  payee_id?: string;
  payee_name: string;
  payee_gst_number?: string;
  payee_bank_name?: string;
  payee_account_number?: string;
  payee_ifsc?: string;
  payee_branch?: string;
  
  taxable_amount?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  
  notes?: string;
  created_by?: string;
  
  lines?: CreateExpenseLineDTO[];
  overheads?: CreateExpenseOverheadDTO[];
  entity_links?: CreateExpenseEntityLinkDTO[];
}

export interface CreateExpenseLineDTO {
  line_number: number;
  description: string;
  quantity?: number;
  unit?: string;
  rate?: number;
  amount: number;
  reference_number?: string;
  reference_date?: string;
  vehicle_number?: string;
  from_location?: string;
  to_location?: string;
}

export interface CreateExpenseOverheadDTO {
  charge_name: string;
  charge_amount: number;
}

export interface CreateExpenseEntityLinkDTO {
  entity_type: string;
  entity_id: string;
}

export interface UpdateExpenseDTO {
  expense_category_id?: string;
  expense_date?: string;
  payee_type?: PayeeType;
  payee_id?: string;
  payee_name?: string;
  payee_gst_number?: string;
  payee_bank_name?: string;
  payee_account_number?: string;
  payee_ifsc?: string;
  payee_branch?: string;
  taxable_amount?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  notes?: string;
  updated_by?: string;
  
  lines?: CreateExpenseLineDTO[];
  overheads?: CreateExpenseOverheadDTO[];
  entity_links?: CreateExpenseEntityLinkDTO[];
}

export interface ExpenseResponse {
  id: string;
  expense_category_id: string;
  expense_category_name?: string;
  expense_category_code?: string;
  expense_number: string;
  financial_year: string;
  serial_number: number;
  expense_date: string;
  
  payee_type: PayeeType;
  payee_id: string | null;
  payee_name: string;
  payee_gst_number: string | null;
  payee_bank_name: string | null;
  payee_account_number: string | null;
  payee_ifsc: string | null;
  payee_branch: string | null;
  
  subtotal: number;
  overhead_total: number;
  taxable_amount: number | null;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  tax_amount: number;
  total_amount: number;
  
  status: ExpenseStatus;
  bill_pdf_url: string | null;
  payment_proof_url: string | null;
  notes: string | null;
  
  created_at: string;
  updated_at: string;
  
  lines: ExpenseLineResponse[];
  overheads: ExpenseOverheadResponse[];
  entity_links: ExpenseEntityLinkResponse[];
}

export interface ExpenseLineResponse {
  id: string;
  line_number: number;
  description: string;
  quantity: number | null;
  unit: string | null;
  rate: number | null;
  amount: number;
  reference_number: string | null;
  reference_date: string | null;
  vehicle_number: string | null;
  from_location: string | null;
  to_location: string | null;
}

export interface ExpenseOverheadResponse {
  id: string;
  charge_name: string;
  charge_amount: number;
}

export interface ExpenseEntityLinkResponse {
  id: string;
  entity_type: string;
  entity_id: string;
  entity_display?: string;
}

export interface AvailableEntity {
  id: string;
  display_name: string;
  date: string;
  amount?: number;
  party_name?: string;
}
