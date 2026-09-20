/** Credit note document types. Screen and posting behaviour follow the operational class. */
export const CREDIT_NOTE_TYPES = [
  'rate_difference',
  'commercial_discount',
  'other',
  'sales_return_full',
  'sales_return_partial',
  'short_quantity',
  'quality_issue',
  'damaged_goods',
] as const;

export type CreditNoteType = (typeof CREDIT_NOTE_TYPES)[number];

export const CREDIT_NOTE_VALUE_ONLY_TYPES = [
  'rate_difference',
  'commercial_discount',
  'other',
] as const satisfies readonly CreditNoteType[];

export const CREDIT_NOTE_QUANTITY_RETURN_TYPES = [
  'sales_return_full',
  'sales_return_partial',
  'short_quantity',
  'quality_issue',
  'damaged_goods',
] as const satisfies readonly CreditNoteType[];

export type CreditNoteOperationalClass = 'value_only' | 'quantity_return';

export const CREDIT_NOTE_STATUSES = ['draft', 'posted', 'cancelled'] as const;
export type CreditNoteStatus = (typeof CREDIT_NOTE_STATUSES)[number];

export const CREDIT_NOTE_COUPON_STATUSES = [
  'returned_with_goods',
  'already_given',
  'already_redeemed',
  'not_applicable',
] as const;
export type CreditNoteCouponStatus = (typeof CREDIT_NOTE_COUPON_STATUSES)[number];

export const CREDIT_NOTE_MATERIAL_CONDITIONS = [
  'saleable',
  'broken_bag',
  'damaged_reprocess',
  'scrap',
  'destroy',
] as const;
export type CreditNoteMaterialCondition = (typeof CREDIT_NOTE_MATERIAL_CONDITIONS)[number];

export const CREDIT_NOTE_ATTACHMENT_TYPES = [
  'customer_letter',
  'lr_copy',
  'return_receipt',
  'weighbridge_slip',
  'goods_photo',
  'credit_note_pdf',
  'other',
] as const;
export type CreditNoteAttachmentType = (typeof CREDIT_NOTE_ATTACHMENT_TYPES)[number];

const VALUE_ONLY_SET = new Set<string>(CREDIT_NOTE_VALUE_ONLY_TYPES);
const QUANTITY_RETURN_SET = new Set<string>(CREDIT_NOTE_QUANTITY_RETURN_TYPES);

export function isCreditNoteType(value: unknown): value is CreditNoteType {
  return typeof value === 'string' && (CREDIT_NOTE_TYPES as readonly string[]).includes(value);
}

export function creditNoteOperationalClass(type: CreditNoteType): CreditNoteOperationalClass {
  if (VALUE_ONLY_SET.has(type)) return 'value_only';
  return 'quantity_return';
}

export function isQuantityReturnType(type: CreditNoteType): boolean {
  return QUANTITY_RETURN_SET.has(type);
}

export function isValueOnlyType(type: CreditNoteType): boolean {
  return VALUE_ONLY_SET.has(type);
}

/** Print name/brand/HSN overrides are only stored on type `other`. */
export function allowsCreditNoteLineDisplayAliases(type: CreditNoteType): boolean {
  return type === 'other';
}

export function defaultCouponStatus(type: CreditNoteType): CreditNoteCouponStatus {
  return isQuantityReturnType(type) ? 'returned_with_goods' : 'not_applicable';
}

export const CREDIT_NOTE_TYPE_LABELS: Record<CreditNoteType, string> = {
  rate_difference: 'Rate difference',
  commercial_discount: 'Commercial discount',
  other: 'Other (value only)',
  sales_return_full: 'Sales return (full)',
  sales_return_partial: 'Sales return (partial)',
  short_quantity: 'Short quantity',
  quality_issue: 'Quality issue',
  damaged_goods: 'Damaged goods',
};

export const CREDIT_NOTE_STATUS_LABELS: Record<CreditNoteStatus, string> = {
  draft: 'Draft',
  posted: 'Posted',
  cancelled: 'Cancelled',
};

export const CREDIT_NOTE_COUPON_STATUS_LABELS: Record<CreditNoteCouponStatus, string> = {
  returned_with_goods: 'Returned with goods',
  already_given: 'Already given',
  already_redeemed: 'Already redeemed',
  not_applicable: 'Not applicable',
};

export const CREDIT_NOTE_MATERIAL_CONDITION_LABELS: Record<CreditNoteMaterialCondition, string> = {
  saleable: 'Saleable',
  broken_bag: 'Broken bag',
  damaged_reprocess: 'Damaged — reprocess',
  scrap: 'Scrap',
  destroy: 'Destroy (do not restore stock)',
};

/** SQL IN-list for quantity-return types (safe: closed enum). */
export const QUANTITY_RETURN_SQL_IN = CREDIT_NOTE_QUANTITY_RETURN_TYPES.map((t) => `'${t}'`).join(
  ', '
);

export {
  formatCreditNoteDocumentNumber as formatCreditNoteNumber,
} from './invoice-number-series';
