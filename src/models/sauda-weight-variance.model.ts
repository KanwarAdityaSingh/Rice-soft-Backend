/**
 * Ex-Godown weight variance ledger: kaanta_weight vs bill_weight mismatches.
 * Informational only — never affects the payment advice amount for Ex-Godown saudas.
 */

export type WeightVarianceDirection = 'short' | 'excess';

export interface SaudaWeightVarianceRecord {
  id: string;
  sauda_id: string;
  payment_advice_id: string;
  inward_slip_pass_id: string | null;
  broker_id: string | null;
  purchaser_id: string | null;
  bill_weight: number;
  kanta_weight: number;
  variance_kg: number;
  direction: WeightVarianceDirection;
  created_at: Date;
  created_by: string | null;
  /** Joined */
  sauda_display_id?: string;
  broker_name?: string | null;
  purchaser_name?: string | null;
  payment_advice_sr_number?: string | null;
}

export interface CreateSaudaWeightVarianceRecordDTO {
  sauda_id: string;
  payment_advice_id: string;
  inward_slip_pass_id?: string | null;
  broker_id?: string | null;
  purchaser_id?: string | null;
  bill_weight: number;
  kanta_weight: number;
  variance_kg: number;
  direction: WeightVarianceDirection;
  created_by?: string | null;
}

export interface SaudaWeightVarianceRecordResponse {
  id: string;
  sauda_id: string;
  sauda_display_id: string;
  payment_advice_id: string;
  payment_advice_sr_number: string | null;
  inward_slip_pass_id: string | null;
  broker_id: string | null;
  broker_name: string | null;
  purchaser_id: string | null;
  purchaser_name: string | null;
  bill_weight: number;
  kanta_weight: number;
  variance_kg: number;
  direction: WeightVarianceDirection;
  created_at: string;
}

/** Embedded in payment-advice responses to flag the note to the frontend. */
export interface PaymentAdviceWeightVariance {
  direction: WeightVarianceDirection;
  variance_kg: number;
  bill_weight: number;
  kanta_weight: number;
  message: string;
}
