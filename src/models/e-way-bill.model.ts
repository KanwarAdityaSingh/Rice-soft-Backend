import type { EWayBillStatus } from '../constants/e-way-bill';

export type { EWayBillStatus };

export interface EWayBill {
  id: string;
  invoice_dispatch_id: string | null;
  credit_note_id: string | null;
  eway_bill_number: string | null;
  vehicle_number: string | null;
  distance_km: number | null;
  route: string | null;
  transporter_id: string | null;
  payload: Record<string, unknown> | null;
  status: EWayBillStatus;
  cancelled_at: Date | null;
  cancel_reason: string | null;
  cancel_remark: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateEWayBillDTO {
  invoice_dispatch_id?: string;
  credit_note_id?: string;
  eway_bill_number?: string;
  vehicle_number?: string;
  distance_km?: number;
  route?: string;
  transporter_id?: string;
  payload?: Record<string, unknown>;
}

export interface CancelEWayBillDTO {
  cancel_reason: string;
  cancel_remark: string;
  payload?: Record<string, unknown>;
}
