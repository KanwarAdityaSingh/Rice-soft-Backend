/** NIC / MastersIndia cancel reasons. Values must match their API exactly. */
export const E_WAY_BILL_CANCEL_REASONS = [
  'Duplicate',
  'Data Entry Mistake',
  'Order Cancelled',
  'Others',
] as const;

export type EWayBillCancelReason = (typeof E_WAY_BILL_CANCEL_REASONS)[number];

export const E_WAY_BILL_STATUSES = ['generated', 'cancelled'] as const;
export type EWayBillStatus = (typeof E_WAY_BILL_STATUSES)[number];
