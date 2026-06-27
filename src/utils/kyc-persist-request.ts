import type { Request } from 'express';
import type { KycVerificationKey, PersistableEntityType } from '../models/kyc-verification.model';
import { ValidationError } from './errors';

export interface ParsedPersistKycRequest {
  entity_type: PersistableEntityType;
  entity_id: string;
  verification_key: KycVerificationKey;
  email?: string;
}

const ENTITY_TYPES: PersistableEntityType[] = [
  'vendor',
  'broker',
  'transporter',
  'sales_party',
  'driver',
  'vehicle',
];

export function parsePersistKycRequest(
  req: Request,
  verificationKey: KycVerificationKey,
  email?: string
): ParsedPersistKycRequest | undefined {
  const source = { ...req.query, ...(req.body ?? {}) } as Record<string, unknown>;
  const entityType = source.entity_type ?? source.persist_entity_type;
  const entityId = source.entity_id ?? source.persist_entity_id;

  if (!entityType && !entityId) {
    return undefined;
  }

  if (!entityType || !entityId) {
    throw new ValidationError('Both entity_type and entity_id are required to persist verification');
  }

  if (typeof entityType !== 'string' || !ENTITY_TYPES.includes(entityType as PersistableEntityType)) {
    throw new ValidationError('entity_type must be vendor, broker, transporter, sales_party, driver, or vehicle');
  }

  if (typeof entityId !== 'string' || entityId.trim() === '') {
    throw new ValidationError('entity_id must be a valid string');
  }

  const persistEmail =
    email ??
    (typeof source.email === 'string' ? source.email : undefined);

  return {
    entity_type: entityType as PersistableEntityType,
    entity_id: entityId.trim(),
    verification_key: verificationKey,
    email: persistEmail,
  };
}

export async function saveKycSnapshotForEntity<TMapped>(
  persist: ParsedPersistKycRequest | undefined,
  envelope: { mapped: TMapped; raw: import('../models/kyc-verification.model').SurepassApiResponse }
): Promise<void> {
  if (!persist) {
    return;
  }
  const { kycPersistenceService } = await import('../services/kyc-persistence.service');
  await kycPersistenceService.persistIfRequested(persist, envelope);
}
