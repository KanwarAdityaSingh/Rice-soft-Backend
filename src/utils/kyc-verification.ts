import type {
  EntityKycVerificationDetails,
  SurepassApiEnvelope,
  SurepassApiResponse,
  SurepassVerificationSnapshot,
  VehicleVerificationDetails,
} from '../models/kyc-verification.model';
import type { TransportType } from '../models/transporter.model';

export function buildSurepassSnapshot<TMapped>(
  envelope: SurepassApiEnvelope<TMapped>
): SurepassVerificationSnapshot {
  return {
    provider: 'surepass',
    verified_at: new Date().toISOString(),
    raw: envelope.raw,
    mapped: envelope.mapped,
  };
}

export function buildSurepassSnapshotFromRaw(
  raw: SurepassApiResponse,
  mapped?: unknown
): SurepassVerificationSnapshot {
  return {
    provider: 'surepass',
    verified_at: new Date().toISOString(),
    raw,
    ...(mapped !== undefined ? { mapped } : {}),
  };
}

export function parseEntityKycDetails(value: unknown): EntityKycVerificationDetails {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as EntityKycVerificationDetails;
}

export function parseVehicleVerificationDetails(value: unknown): VehicleVerificationDetails {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as VehicleVerificationDetails;
}

export function mergeEntityKycDetailsPatch(
  existing: EntityKycVerificationDetails,
  patch: EntityKycVerificationDetails | undefined | null
): EntityKycVerificationDetails {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return existing;
  }

  const result: EntityKycVerificationDetails = { ...existing };

  for (const [key, value] of Object.entries(patch) as [
    keyof EntityKycVerificationDetails,
    unknown,
  ][]) {
    if (value === undefined || value === null) {
      continue;
    }
    if (key === 'emails' && typeof value === 'object' && !Array.isArray(value)) {
      result.emails = {
        ...(existing.emails ?? {}),
        ...(value as NonNullable<EntityKycVerificationDetails['emails']>),
      };
      continue;
    }
    (result as Record<string, unknown>)[key as string] = value;
  }

  return result;
}

export function mergeVehicleVerificationDetailsPatch(
  existing: VehicleVerificationDetails,
  patch: VehicleVerificationDetails | undefined | null
): VehicleVerificationDetails {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return existing;
  }

  return {
    ...existing,
    ...(patch.rc !== undefined ? { rc: patch.rc } : {}),
    ...(patch.rc_full !== undefined ? { rc_full: patch.rc_full } : {}),
    ...(patch.rc_challan !== undefined ? { rc_challan: patch.rc_challan } : {}),
  };
}

export function mergeEntityKycSnapshot(
  existing: EntityKycVerificationDetails,
  key: keyof EntityKycVerificationDetails,
  snapshot: SurepassVerificationSnapshot,
  email?: string
): EntityKycVerificationDetails {
  if (key === 'emails') {
    if (!email) {
      return existing;
    }
    const normalizedEmail = email.trim().toLowerCase();
    return {
      ...existing,
      emails: {
        ...(existing.emails ?? {}),
        [normalizedEmail]: snapshot,
      },
    };
  }

  return {
    ...existing,
    [key]: snapshot,
  };
}

export function mergeVehicleVerificationSnapshot(
  existing: VehicleVerificationDetails,
  key: keyof VehicleVerificationDetails,
  snapshot: SurepassVerificationSnapshot
): VehicleVerificationDetails {
  return {
    ...existing,
    [key]: snapshot,
  };
}

function hasKycSnapshot(
  kyc: EntityKycVerificationDetails,
  key: keyof EntityKycVerificationDetails
): boolean {
  const value = kyc[key];
  return (
    value !== undefined &&
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'verified_at' in value
  );
}

/** Registered → GST or PAN snapshot; unregistered → Aadhaar snapshot. */
export function isTransporterKycVerified(
  transportType: TransportType,
  kyc: EntityKycVerificationDetails
): boolean {
  if (transportType === 'unregistered') {
    return hasKycSnapshot(kyc, 'aadhaar');
  }

  return (
    hasKycSnapshot(kyc, 'gst_advanced') ||
    hasKycSnapshot(kyc, 'gst') ||
    hasKycSnapshot(kyc, 'pan_comprehensive') ||
    hasKycSnapshot(kyc, 'pan')
  );
}
