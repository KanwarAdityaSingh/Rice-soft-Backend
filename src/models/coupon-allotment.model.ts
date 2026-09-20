export const COUPON_ALLOTMENT_HEADER_STATUSES = ['active', 'cancelled'] as const;
export type CouponAllotmentHeaderStatus = (typeof COUPON_ALLOTMENT_HEADER_STATUSES)[number];

export const COUPON_ALLOTMENT_LINE_STATUSES = ['active', 'unlinked'] as const;
export type CouponAllotmentLineStatus = (typeof COUPON_ALLOTMENT_LINE_STATUSES)[number];

/** One per invoice dispatch. Invoice No./Date/Customer are read via invoice_dispatch_id join. */
export interface CouponAllotmentHeader {
  id: string;
  invoice_dispatch_id: string;
  status: CouponAllotmentHeaderStatus;
  remarks: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * One row per (invoice_dispatch_line, coupon_batch) pairing.
 * coupons_required/coupons_allotted are scoped to THIS batch assignment only — a single
 * invoice line's total fulfillment is the sum of coupons_allotted across all of its active
 * lines (it may span more than one batch if a shortfall was topped up from a second batch).
 */
export interface CouponAllotmentLine {
  id: string;
  coupon_allotment_header_id: string;
  invoice_dispatch_line_id: string;
  coupon_batch_id: string;
  face_value_paise: number;
  coupons_required: number;
  coupons_allotted: number;
  from_serial: string | null;
  to_serial: string | null;
  status: CouponAllotmentLineStatus;
  unlinked_at: Date | null;
  unlinked_reason: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

/** Insert-only per-coupon ledger row; never deleted, only stamped with unlinked_at. */
export interface CouponAllotmentLineCoupon {
  id: string;
  coupon_allotment_line_id: string;
  coupon_id: string;
  linked_at: Date;
  unlinked_at: Date | null;
  unlinked_reason: string | null;
}

export interface CreateCouponAllotmentLineDTO {
  coupon_allotment_header_id: string;
  invoice_dispatch_line_id: string;
  coupon_batch_id: string;
  face_value_paise: number;
  coupons_required: number;
  coupons_allotted: number;
  from_serial: string | null;
  to_serial: string | null;
  created_by?: string | null;
}

export interface SerialRangeInput {
  from_serial: string;
  to_serial: string;
}

/**
 * How to pick coupons from the chosen batch for one line.
 * Omitted/`next_available` (default): auto-pick the next N printed coupons in sequence.
 * `serial_range`: caller picks one exact range; span must be <= outstanding bags for
 * the line (never allot more coupons than bags), but may be less (partial, top up later).
 * `serial_ranges`: same as `serial_range` but multiple disjoint ranges in one request —
 * e.g. serials 1-5 and 8-12 from the same batch. Each range still becomes its own
 * coupon_allotment_lines row (one ledger row per physical range, for a transparent audit
 * trail) — this mode is sugar so the caller doesn't have to repeat invoice_dispatch_line_id
 * / coupon_batch_id once per range.
 */
export type AllotmentSelectionMode =
  | { mode?: undefined }
  | { mode: 'next_available' }
  | { mode: 'serial_range'; from_serial: string; to_serial: string }
  | { mode: 'serial_ranges'; ranges: SerialRangeInput[] };

/** One (invoice_dispatch_line_id, coupon_batch_id) request from the "Confirm Allotment" screen. */
export type ConfirmAllotmentLineRequest = {
  invoice_dispatch_line_id: string;
  coupon_batch_id: string;
} & AllotmentSelectionMode;

export type PreviewAllotmentRequest = { coupon_batch_id: string } & (
  | { mode?: undefined; count: number }
  | { mode: 'next_available'; count: number }
  | { mode: 'serial_range'; from_serial: string; to_serial: string }
  | { mode: 'serial_ranges'; ranges: SerialRangeInput[] }
);

/** A candidate invoice dispatch line, enriched for the "select rice variety" step of the UI. */
export interface AllotmentCandidateLine {
  invoice_dispatch_line_id: string;
  line_type: 'product' | 'lot';
  product_id: string | null;
  product_name: string | null;
  lot_id: string | null;
  lot_number: string | null;
  /** Display label for "Rice Variety" column (product name, or lot number + rice category) */
  variety_label: string;
  /** 1 coupon per bag — packet_count (product lines) or no_of_bags (lot lines) */
  bags: number | null;
  already_allotted: number;
  outstanding: number;
  active_lines: CouponAllotmentLineDetail[];
}

export interface CouponAllotmentLineDetail extends CouponAllotmentLine {
  coupon_batch_code: string;
  variety_label: string;
}

export interface CouponAllotmentHeaderWithLines extends CouponAllotmentHeader {
  lines: CouponAllotmentLineDetail[];
}

export interface AllotmentPreviewRangeResult {
  from_serial: string | null;
  to_serial: string | null;
  requested_count: number;
  available_count: number;
  shortfall: number;
}

export interface AllotmentPreviewResult {
  coupon_batch_id: string;
  requested_count: number;
  available_count: number;
  from_serial: string | null;
  to_serial: string | null;
  shortfall: number;
  /** Present when mode='serial_ranges' — per-range breakdown so the UI can flag which one is short */
  ranges?: AllotmentPreviewRangeResult[];
}

export interface AllotmentHistoryFilters {
  coupon_batch_id?: string;
  invoice_dispatch_id?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface AllotmentHistoryRow {
  coupon_allotment_line_id: string;
  created_at: Date;
  invoice_dispatch_id: string;
  internal_invoice_number: string;
  dispatch_date: string | null;
  party_name: string;
  variety_label: string;
  coupon_batch_id: string;
  coupon_batch_code: string;
  face_value_paise: number;
  coupons_required: number;
  coupons_allotted: number;
  from_serial: string | null;
  to_serial: string | null;
  status: CouponAllotmentLineStatus;
  unlinked_at: Date | null;
  unlinked_reason: string | null;
}

export interface CouponBatchAllotmentProgress {
  coupon_batch_id: string;
  total_count: number;
  allotted_count: number;
  remaining_count: number;
  first_allotted_at: Date | null;
  last_allotted_at: Date | null;
}

/**
 * Invoice-level rollup for the coupon allotment worklist tab.
 * - unallotted: no active coupons locked yet
 * - partial: some locked, bags still outstanding
 * - fulfilled: bags > 0 and outstanding = 0
 */
export const INVOICE_ALLOTMENT_FULFILLMENTS = ['unallotted', 'partial', 'fulfilled'] as const;
export type InvoiceAllotmentFulfillment = (typeof INVOICE_ALLOTMENT_FULFILLMENTS)[number];

export interface InvoiceAllotmentSummaryFilters {
  search?: string;
  fulfillment?: InvoiceAllotmentFulfillment;
  page?: number;
  limit?: number;
}

export interface InvoiceAllotmentSummary {
  invoice_dispatch_id: string;
  serial_number: number | null;
  internal_invoice_number: string;
  dispatch_date: string | null;
  party_name: string;
  status: string;
  godown_id: string;
  coupons_required: number;
  coupons_allotted: number;
  outstanding: number;
  fulfillment: InvoiceAllotmentFulfillment;
}
