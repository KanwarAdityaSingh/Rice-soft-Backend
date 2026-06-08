import { db } from '../database/connection';
import { logger } from '../utils/logger';
import type {
  EntityKycVerificationDetails,
  KycVerificationKey,
  PersistableEntityType,
  SurepassApiEnvelope,
  VehicleVerificationDetails,
} from '../models/kyc-verification.model';
import {
  buildSurepassSnapshot,
  mergeEntityKycSnapshot,
  mergeVehicleVerificationSnapshot,
  parseEntityKycDetails,
  parseVehicleVerificationDetails,
} from '../utils/kyc-verification';

const ENTITY_KYC_TABLES: Record<'vendor' | 'broker' | 'transporter', string> = {
  vendor: 'vendors',
  broker: 'brokers',
  transporter: 'transporters',
};

function entityKycKeyForVerification(
  verificationKey: KycVerificationKey
): keyof EntityKycVerificationDetails | 'emails' {
  switch (verificationKey) {
    case 'pan':
      return 'pan';
    case 'pan_comprehensive':
      return 'pan_comprehensive';
    case 'gst':
      return 'gst';
    case 'gst_advanced':
      return 'gst_advanced';
    case 'aadhaar':
      return 'aadhaar';
    case 'bank':
      return 'bank';
    case 'email':
      return 'emails';
    case 'driving_license':
      return 'driving_license';
    default:
      return 'pan';
  }
}

function vehicleKeyForVerification(
  verificationKey: KycVerificationKey
): keyof VehicleVerificationDetails | null {
  if (verificationKey === 'rc') {
    return 'rc';
  }
  if (verificationKey === 'rc_challan') {
    return 'rc_challan';
  }
  return null;
}

export class KycPersistenceService {
  static async saveEntityVerification<TMapped>(
    entityType: 'vendor' | 'broker' | 'transporter',
    entityId: string,
    verificationKey: KycVerificationKey,
    envelope: SurepassApiEnvelope<TMapped>,
    email?: string
  ): Promise<void> {
    const table = ENTITY_KYC_TABLES[entityType];
    const kycKey = entityKycKeyForVerification(verificationKey);
    const snapshot = buildSurepassSnapshot(envelope);

    const existingResult = await db.query<{ kyc_verification_details: unknown }>(
      `SELECT kyc_verification_details FROM ${table} WHERE id = $1`,
      [entityId]
    );
    if (existingResult.rows.length === 0) {
      logger.warn('KYC persist skipped: entity not found', { entityType, entityId });
      return;
    }

    const merged = mergeEntityKycSnapshot(
      parseEntityKycDetails(existingResult.rows[0].kyc_verification_details),
      kycKey,
      snapshot,
      email
    );

    await db.query(
      `UPDATE ${table}
       SET kyc_verification_details = $2::jsonb, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [entityId, JSON.stringify(merged)]
    );

    logger.info('Surepass verification snapshot saved', {
      entityType,
      entityId,
      verificationKey,
    });
  }

  static async saveDriverVerification<TMapped>(
    driverId: string,
    envelope: SurepassApiEnvelope<TMapped>
  ): Promise<void> {
    const snapshot = buildSurepassSnapshot(envelope);
    await db.query(
      `UPDATE drivers
       SET verification_details = $2::jsonb,
           is_verified = true,
           verified_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [driverId, JSON.stringify(snapshot)]
    );
    logger.info('Driver Surepass verification snapshot saved', { driverId });
  }

  static async saveVehicleVerification<TMapped>(
    vehicleId: string,
    verificationKey: 'rc' | 'rc_challan',
    envelope: SurepassApiEnvelope<TMapped>
  ): Promise<void> {
    const vehicleKey = vehicleKeyForVerification(verificationKey);
    if (!vehicleKey) {
      return;
    }

    const snapshot = buildSurepassSnapshot(envelope);
    const existingResult = await db.query<{ verification_details: unknown }>(
      `SELECT verification_details FROM vehicles WHERE id = $1`,
      [vehicleId]
    );
    if (existingResult.rows.length === 0) {
      logger.warn('Vehicle KYC persist skipped: not found', { vehicleId });
      return;
    }

    const merged = mergeVehicleVerificationSnapshot(
      parseVehicleVerificationDetails(existingResult.rows[0].verification_details),
      vehicleKey,
      snapshot
    );

    const updates: string[] = [
      'verification_details = $2::jsonb',
      'updated_at = CURRENT_TIMESTAMP',
    ];
    const values: unknown[] = [vehicleId, JSON.stringify(merged)];

    if (verificationKey === 'rc') {
      updates.push('is_verified = true', 'verified_at = CURRENT_TIMESTAMP');
    }
    if (verificationKey === 'rc_challan') {
      const challans = (envelope.mapped as { challan_details?: { challans?: unknown[] } })
        ?.challan_details?.challans;
      if (Array.isArray(challans)) {
        updates.push(`challan_details = $${values.length + 1}::jsonb`);
        values.push(JSON.stringify(challans));
      }
    }

    await db.query(
      `UPDATE vehicles SET ${updates.join(', ')} WHERE id = $1`,
      values
    );

    logger.info('Vehicle Surepass verification snapshot saved', {
      vehicleId,
      verificationKey,
    });
  }

  static async persistIfRequested<TMapped>(
    options:
      | {
          entity_type?: PersistableEntityType;
          entity_id?: string;
          verification_key: KycVerificationKey;
          email?: string;
        }
      | undefined,
    envelope: SurepassApiEnvelope<TMapped>
  ): Promise<void> {
    if (!options?.entity_type || !options.entity_id) {
      return;
    }

    const { entity_type, entity_id, verification_key, email } = options;

    if (entity_type === 'driver') {
      await this.saveDriverVerification(entity_id, envelope);
      return;
    }

    if (entity_type === 'vehicle') {
      if (verification_key !== 'rc' && verification_key !== 'rc_challan') {
        return;
      }
      await this.saveVehicleVerification(entity_id, verification_key, envelope);
      return;
    }

    await this.saveEntityVerification(entity_type, entity_id, verification_key, envelope, email);
  }
}

export const kycPersistenceService = KycPersistenceService;
