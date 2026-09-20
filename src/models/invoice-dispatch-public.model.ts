export type BosVerificationStatus = 'draft' | 'confirmed' | 'cancelled';

export interface BosVerificationLine {
  description: string;
  quantity: number;
  quantity_unit: string;
  rate: number;
  amount: number;
}

export interface BosVerificationResult {
  valid: boolean;
  status: BosVerificationStatus;
  internal_invoice_number: string;
  dispatch_date: string | null;
  party_name: string;
  party_gst_number: string | null;
  grand_total: number;
  verified_at: string;
  eway_bill_number: string | null;
  lines: BosVerificationLine[];
}
