/** Full Surepass HTTP JSON body (data + status fields). */
export interface SurepassApiResponse<TData = unknown> {
  data?: TData;
  status_code: number;
  success: boolean;
  message: string | null;
  message_code?: string;
}

/** Normalized mapped payload + untouched provider response for persistence. */
export interface SurepassApiEnvelope<TMapped> {
  mapped: TMapped;
  raw: SurepassApiResponse;
}

export type KycVerificationKey =
  | 'pan'
  | 'pan_comprehensive'
  | 'gst'
  | 'gst_advanced'
  | 'aadhaar'
  | 'bank'
  | 'email'
  | 'driving_license'
  | 'rc'
  | 'rc_challan';

export interface SurepassVerificationSnapshot {
  provider: 'surepass';
  verified_at: string;
  raw: SurepassApiResponse;
  mapped?: unknown;
}

/** Stored on vendors, brokers, transporters (JSONB column). */
export interface EntityKycVerificationDetails {
  pan?: SurepassVerificationSnapshot;
  pan_comprehensive?: SurepassVerificationSnapshot;
  gst?: SurepassVerificationSnapshot;
  gst_advanced?: SurepassVerificationSnapshot;
  aadhaar?: SurepassVerificationSnapshot;
  bank?: SurepassVerificationSnapshot;
  driving_license?: SurepassVerificationSnapshot;
  /** Keyed by normalized email address. */
  emails?: Record<string, SurepassVerificationSnapshot>;
}

/** Stored on vehicles (JSONB column). */
export interface VehicleVerificationDetails {
  rc?: SurepassVerificationSnapshot;
  rc_challan?: SurepassVerificationSnapshot;
}

export type PersistableEntityType = 'vendor' | 'broker' | 'transporter' | 'driver' | 'vehicle';

export interface PersistKycOptions {
  entity_type: PersistableEntityType;
  entity_id: string;
  verification_key: KycVerificationKey;
  email?: string;
}
