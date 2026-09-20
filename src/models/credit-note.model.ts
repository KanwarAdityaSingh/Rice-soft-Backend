import type { SalesSaudaDiscountType } from './sales-sauda-line.model';
import type {
  CreditNoteAttachmentType,
  CreditNoteCouponStatus,
  CreditNoteMaterialCondition,
  CreditNoteStatus,
  CreditNoteType,
} from '../constants/credit-note';

export type {
  CreditNoteAttachmentType,
  CreditNoteCouponStatus,
  CreditNoteMaterialCondition,
  CreditNoteStatus,
  CreditNoteType,
};

export interface CreditNote {
  id: string;
  invoice_dispatch_id: string;
  sales_sauda_id: string;
  credit_note_number: string;
  credit_note_date: Date | string | null;
  financial_year: string;
  serial_number: number;
  credit_note_type: CreditNoteType;
  status: CreditNoteStatus;
  reason: string | null;
  coupon_status: CreditNoteCouponStatus;
  material_condition: CreditNoteMaterialCondition | null;
  receiving_godown_id: string | null;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_credit_amount: number;
  posted_at: Date | null;
  posted_by: string | null;
  cancelled_at: Date | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  edit_reason: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateCreditNoteHeaderDTO {
  invoice_dispatch_id: string;
  sales_sauda_id: string;
  credit_note_number: string;
  credit_note_date?: string | Date | null;
  financial_year: string;
  credit_note_type: CreditNoteType;
  reason: string;
  coupon_status: CreditNoteCouponStatus;
  material_condition?: CreditNoteMaterialCondition | null;
  receiving_godown_id?: string | null;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_credit_amount: number;
  /** Per-state series sequence (A/HR/CN/26-27/{n}). Passed so the FY trigger does not assign a different number. */
  serial_number?: number;
  created_by?: string;
}

export interface UpdateCreditNoteHeaderDTO {
  credit_note_date?: string | Date | null;
  financial_year?: string;
  credit_note_type?: CreditNoteType;
  reason?: string;
  coupon_status?: CreditNoteCouponStatus;
  material_condition?: CreditNoteMaterialCondition | null;
  receiving_godown_id?: string | null;
  taxable_amount?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  total_credit_amount?: number;
  edit_reason?: string | null;
  updated_by?: string;
}

export interface CreditNoteLineInput {
  invoice_dispatch_line_id: string;
  product_id?: string | null;
  /** Print name on this CN only. Used when credit_note_type is `other`. Omit to copy invoice alias / product name. */
  product_alias?: string | null;
  /** Print brand on this CN only. Used when credit_note_type is `other`. Omit to copy product brand. */
  brand?: string | null;
  /** Print HSN on this CN only. Used when credit_note_type is `other`. Omit to copy product HSN. */
  hsn_code?: string | null;
  /** Canonical qty this line applies to. Alias: quantity_returned. */
  quantity_credited?: number;
  quantity_returned?: number;
  quantity_actual_returned?: number | null;
  quantity_verified?: number | null;
  corrected_rate?: number | null;
  credit_taxable_input?: number | null;
}

export interface CreateCreditNoteRequest {
  invoice_dispatch_id: string;
  credit_note_type: CreditNoteType;
  credit_note_date?: string | null;
  reason: string;
  coupon_status?: CreditNoteCouponStatus;
  material_condition?: CreditNoteMaterialCondition | null;
  receiving_godown_id?: string | null;
  lines?: CreditNoteLineInput[];
}

export interface UpdateCreditNoteRequest {
  credit_note_type?: CreditNoteType;
  credit_note_date?: string | null;
  reason?: string;
  coupon_status?: CreditNoteCouponStatus;
  material_condition?: CreditNoteMaterialCondition | null;
  receiving_godown_id?: string | null;
  edit_reason?: string;
  lines?: CreditNoteLineInput[];
}

export interface CreditNoteListFilters {
  invoiceDispatchId?: string;
  status?: CreditNoteStatus;
  creditNoteType?: CreditNoteType;
  financialYear?: string;
  partyId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  pagination?: { limit: number; offset: number };
}

export interface CreditNoteListRow extends CreditNote {
  invoice_number: string | null;
  invoice_date: string | null;
  party_name: string | null;
  party_phone: string | null;
}

export interface CreditNoteGstSplit {
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  final_amount: number;
}

export interface CreditNoteLineSnapshot extends CreditNoteGstSplit {
  rate: number | null;
  gst_percent: number | null;
  discount_value: number | null;
  discount_type: SalesSaudaDiscountType | null;
}

/** Display-ready credit note for preview / print / form. */
export interface CreditNotePreviewLine {
  id: string;
  invoice_dispatch_line_id: string;
  product_id: string | null;
  product_name: string;
  product_alias: string | null;
  brand: string | null;
  hsn_code: string | null;
  quantity_credited: number;
  quantity_invoiced: number | null;
  quantity_verified: number | null;
  quantity_short: number | null;
  quantity_actual_returned: number | null;
  original_rate: number | null;
  corrected_rate: number | null;
  rate: number | null;
  gst_percent: number | null;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  gst_amount: number;
  final_amount: number;
}

export interface CreditNotePreviewParty {
  name: string | null;
  gstin: string | null;
  pan: string | null;
  phone: string | null;
  address: unknown;
}

export interface CreditNotePreviewGodown {
  id: string;
  name: string;
  gstin: string | null;
  address: unknown;
}

export interface CreditNotePreview {
  id: string;
  document_type: 'CN';
  document_number: string;
  document_date: string | null;
  financial_year: string | null;
  serial_number: number | null;
  status: CreditNoteStatus;
  status_label: string;
  credit_note_type: CreditNoteType;
  credit_note_type_label: string;
  operational_class: 'value_only' | 'quantity_return';
  reason: string | null;
  coupon_status: CreditNoteCouponStatus;
  coupon_status_label: string;
  material_condition: CreditNoteMaterialCondition | null;
  material_condition_label: string | null;
  preview_notice: string | null;
  invoice_dispatch_id: string;
  sales_sauda_id: string;
  seller: CreditNotePreviewGodown | null;
  buyer: CreditNotePreviewParty;
  invoice: {
    id: string;
    invoice_number: string;
    invoice_date: string | null;
    invoice_amount: number;
    godown_id: string;
  } | null;
  receiving_godown: CreditNotePreviewGodown | null;
  lines: CreditNotePreviewLine[];
  totals: {
    taxable_amount: number;
    cgst_amount: number;
    sgst_amount: number;
    igst_amount: number;
    gst_amount: number;
    total_credit_amount: number;
  };
  financial_summary: {
    invoice_value: number;
    previous_credits: number;
    current_credit: number;
    total_credits: number;
    remaining_invoice: number;
    gst_reversal: { cgst: number; sgst: number; igst: number };
    net_credit: number;
  };
  attachments: unknown[];
  timeline: Array<{ event: string; at: unknown; label: string }>;
}
