import { db } from '../database/connection';
import {
  MasterVendor,
  CreateMasterVendorDTO,
  UpdateMasterVendorDTO,
  MasterVendorRegistrationType,
  MasterVendorStatus,
} from '../models/packaging-vendor.model';
import type { ContactPerson, Address } from '../models/vendor.model';
import {
  mergeEntityKycDetailsPatch,
  parseEntityKycDetails,
  isMasterVendorKycVerified,
  resolveMasterVendorStatus,
} from '../utils/kyc-verification';
import { logger } from '../utils/logger';
import { buildNormalizedSearchClause } from '../utils/search';

const COLUMNS = `
  id, business_name, name, contact_persons, address, gst_number,
  business_details, bank_details, registration_type, status, is_active,
  is_verified, verified_at, kyc_verification_details,
  credit_period_days, credit_limit, opening_balance, address_locked,
  google_location_link, created_at, updated_at, created_by, updated_by
`;

export interface MasterVendorListFilters {
  includeInactive?: boolean;
  status?: MasterVendorStatus;
  isVerified?: boolean;
  registrationType?: MasterVendorRegistrationType;
  search?: string;
}

function transformContactPersons(data: unknown): ContactPerson[] {
  if (!data) return [];
  let parsed: unknown = data;
  if (typeof data === 'string') {
    try {
      parsed = JSON.parse(data);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map((item: Record<string, unknown>) => {
    if (item.phone !== undefined && !item.phones) {
      return {
        name: String(item.name || ''),
        phones: item.phone ? [String(item.phone)] : [],
        emails: Array.isArray(item.emails) ? (item.emails as string[]) : undefined,
      };
    }
    return {
      name: String(item.name || ''),
      phones: Array.isArray(item.phones) ? (item.phones as string[]) : [],
      emails: Array.isArray(item.emails) ? (item.emails as string[]) : undefined,
    };
  });
}

function transformAddress(data: unknown): Address {
  const empty: Address = { street: '', city: '', state: '', pincode: '', country: '' };
  if (!data) return empty;
  let parsed: Record<string, unknown> = data as Record<string, unknown>;
  if (typeof data === 'string') {
    try {
      parsed = JSON.parse(data);
    } catch {
      return empty;
    }
  }
  return {
    street: String(parsed.street || ''),
    city: String(parsed.city || ''),
    state: String(parsed.state || ''),
    pincode: String(parsed.pincode || ''),
    country: String(parsed.country || ''),
  };
}

function transformVendor(row: Record<string, unknown>): MasterVendor {
  const businessName = String(row.business_name || row.name || '');
  const businessDetails =
    typeof row.business_details === 'string'
      ? JSON.parse(row.business_details)
      : (row.business_details as MasterVendor['business_details']) || {};

  const legacyGst =
    row.gst_number != null && String(row.gst_number).trim() !== ''
      ? String(row.gst_number)
      : null;
  if (!businessDetails.gst_number && legacyGst) {
    businessDetails.gst_number = legacyGst;
  }

  return {
    id: String(row.id),
    business_name: businessName,
    name: String(row.name || businessName),
    contact_persons: transformContactPersons(row.contact_persons),
    address: transformAddress(row.address),
    gst_number: businessDetails.gst_number || legacyGst,
    business_details: businessDetails,
    bank_details:
      row.bank_details == null
        ? null
        : typeof row.bank_details === 'string'
          ? JSON.parse(row.bank_details)
          : (row.bank_details as MasterVendor['bank_details']),
    registration_type: (row.registration_type as MasterVendorRegistrationType) || 'consumer',
    status: (row.status as MasterVendorStatus) || 'active',
    is_active: Boolean(row.is_active),
    is_verified: Boolean(row.is_verified),
    verified_at: (row.verified_at as Date) || null,
    kyc_verification_details: parseEntityKycDetails(row.kyc_verification_details),
    credit_period_days:
      row.credit_period_days != null ? Number(row.credit_period_days) : null,
    credit_limit: row.credit_limit != null ? Number(row.credit_limit) : null,
    opening_balance: row.opening_balance != null ? Number(row.opening_balance) : null,
    address_locked: Boolean(row.address_locked),
    google_location_link:
      row.google_location_link != null ? String(row.google_location_link) : null,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
    created_by: (row.created_by as string) || null,
    updated_by: (row.updated_by as string) || null,
  };
}

function resolveBusinessName(data: { business_name?: string; name?: string }): string {
  return (data.business_name ?? data.name ?? '').trim();
}

function mergeBusinessDetails(
  details: CreateMasterVendorDTO['business_details'] | undefined,
  gstNumber?: string | null
): CreateMasterVendorDTO['business_details'] {
  const merged = { ...(details ?? {}) };
  if (gstNumber != null && String(gstNumber).trim() !== '' && !merged.gst_number) {
    merged.gst_number = String(gstNumber).trim();
  }
  return merged;
}

export class PackagingVendorDAO {
  async findAll(
    filters: MasterVendorListFilters = {},
    pagination?: { limit: number; offset: number }
  ): Promise<{ rows: MasterVendor[]; total: number }> {
    const {
      includeInactive = false,
      status,
      isVerified,
      registrationType,
      search,
    } = filters;

    let where = `WHERE 1=1`;
    const params: unknown[] = [];
    let paramCount = 1;

    if (status) {
      where += ` AND status = $${paramCount++}`;
      params.push(status);
    } else if (!includeInactive) {
      where += ` AND status = 'active'`;
    }

    if (isVerified === true) {
      where += ` AND is_verified = true`;
    } else if (isVerified === false) {
      where += ` AND is_verified = false`;
    }

    if (registrationType) {
      where += ` AND registration_type = $${paramCount++}`;
      params.push(registrationType);
    }

    const searchClause = buildNormalizedSearchClause(
      [
        'business_name',
        'name',
        'gst_number',
        `business_details->>'gst_number'`,
        `business_details->>'pan_number'`,
      ],
      search,
      paramCount
    );
    where += searchClause.sql;
    params.push(...searchClause.params);
    paramCount = searchClause.nextParamIndex;

    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM packaging_vendors ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    let query = `SELECT ${COLUMNS} FROM packaging_vendors ${where} ORDER BY business_name ASC`;
    if (pagination) {
      params.push(pagination.limit, pagination.offset);
      query += ` LIMIT $${paramCount++} OFFSET $${paramCount}`;
    }

    const result = await db.query(query, params);
    return { rows: result.rows.map((row) => transformVendor(row)), total };
  }

  /** Typeahead for master vendor name (prevents duplicate creation UX). */
  async suggestByName(q: string, limit = 10): Promise<MasterVendor[]> {
    const searchClause = buildNormalizedSearchClause(
      ['business_name', 'name'],
      q,
      1
    );
    if (!searchClause.params.length) return [];
    const query = `
      SELECT ${COLUMNS}
      FROM packaging_vendors
      WHERE 1=1${searchClause.sql}
      ORDER BY business_name ASC
      LIMIT $${searchClause.nextParamIndex}
    `;
    const result = await db.query(query, [...searchClause.params, limit]);
    return result.rows.map((row) => transformVendor(row));
  }

  async findById(id: string): Promise<MasterVendor | null> {
    const result = await db.query(`SELECT ${COLUMNS} FROM packaging_vendors WHERE id = $1`, [id]);
    return result.rows[0] ? transformVendor(result.rows[0]) : null;
  }

  async findByEmail(email: string): Promise<MasterVendor | null> {
    const query = `
      SELECT ${COLUMNS}
      FROM packaging_vendors
      WHERE contact_persons::text ILIKE $1
      LIMIT 1
    `;
    const result = await db.query(query, [`%${email.trim()}%`]);
    if (!result.rows[0]) return null;
    const vendor = transformVendor(result.rows[0]);
    const match = vendor.contact_persons.some((c) =>
      (c.emails || []).some((e) => e.trim().toLowerCase() === email.trim().toLowerCase())
    );
    return match ? vendor : null;
  }

  async findByBusinessName(businessName: string): Promise<MasterVendor | null> {
    const query = `
      SELECT ${COLUMNS}
      FROM packaging_vendors
      WHERE LOWER(TRIM(business_name)) = LOWER(TRIM($1))
      LIMIT 1
    `;
    const result = await db.query(query, [businessName]);
    return result.rows[0] ? transformVendor(result.rows[0]) : null;
  }

  async create(data: CreateMasterVendorDTO): Promise<MasterVendor> {
    const businessName = resolveBusinessName(data);
    const businessDetails = mergeBusinessDetails(data.business_details, data.gst_number);
    const kycDetails = mergeEntityKycDetailsPatch({}, data.kyc_verification_details);
    const isVerified =
      data.is_verified !== undefined
        ? data.is_verified
        : isMasterVendorKycVerified(data.registration_type, kycDetails);
    const status = resolveMasterVendorStatus(isVerified, data.status);
    const isActive = status === 'active';
    const addressLocked =
      data.address_locked !== undefined
        ? data.address_locked
        : Boolean(kycDetails.gst_advanced || kycDetails.gst);

    const gstTopLevel = businessDetails.gst_number?.trim() || null;

    const query = `
      INSERT INTO packaging_vendors (
        name, business_name, contact_persons, address, gst_number,
        business_details, bank_details, registration_type, status, is_active,
        is_verified, verified_at, kyc_verification_details,
        credit_period_days, credit_limit, opening_balance, address_locked,
        google_location_link, created_by
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19
      )
      RETURNING ${COLUMNS}
    `;

    const values = [
      businessName,
      businessName,
      JSON.stringify(data.contact_persons),
      JSON.stringify(data.address),
      gstTopLevel,
      JSON.stringify(businessDetails),
      data.bank_details ? JSON.stringify(data.bank_details) : null,
      data.registration_type,
      status,
      isActive,
      isVerified,
      isVerified ? data.verified_at || new Date() : null,
      JSON.stringify(kycDetails),
      data.credit_period_days ?? null,
      data.credit_limit ?? null,
      data.opening_balance ?? null,
      addressLocked,
      data.google_location_link || null,
      data.created_by || null,
    ];

    const result = await db.query(query, values);
    const row = transformVendor(result.rows[0]);
    logger.info('Master vendor created', {
      id: row.id,
      business_name: row.business_name,
      registration_type: row.registration_type,
    });
    return row;
  }

  async update(id: string, data: UpdateMasterVendorDTO): Promise<MasterVendor | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const updateFields: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;
    let verifiedForStatus: boolean | undefined;
    let nextRegistrationType = existing.registration_type;
    let mergedKyc = existing.kyc_verification_details;

    const businessName = resolveBusinessName({
      business_name: data.business_name,
      name: data.name,
    });
    if (data.business_name !== undefined || data.name !== undefined) {
      if (businessName) {
        updateFields.push(`business_name = $${paramCount++}`);
        values.push(businessName);
        updateFields.push(`name = $${paramCount++}`);
        values.push(businessName);
      }
    }

    if (data.contact_persons !== undefined) {
      updateFields.push(`contact_persons = $${paramCount++}`);
      values.push(JSON.stringify(data.contact_persons));
    }

    if (data.address !== undefined) {
      updateFields.push(`address = $${paramCount++}`);
      values.push(JSON.stringify(data.address));
    }

    if (data.business_details !== undefined || data.gst_number !== undefined) {
      const mergedDetails = mergeBusinessDetails(
        data.business_details ?? existing.business_details,
        data.gst_number
      );
      updateFields.push(`business_details = $${paramCount++}`);
      values.push(JSON.stringify(mergedDetails));
      updateFields.push(`gst_number = $${paramCount++}`);
      values.push(mergedDetails.gst_number?.trim() || null);
    }

    if (data.registration_type !== undefined) {
      nextRegistrationType = data.registration_type;
      updateFields.push(`registration_type = $${paramCount++}`);
      values.push(data.registration_type);
    }

    if (data.bank_details !== undefined) {
      updateFields.push(`bank_details = $${paramCount++}`);
      values.push(JSON.stringify(data.bank_details));
    }

    if (data.credit_period_days !== undefined) {
      updateFields.push(`credit_period_days = $${paramCount++}`);
      values.push(data.credit_period_days);
    }
    if (data.credit_limit !== undefined) {
      updateFields.push(`credit_limit = $${paramCount++}`);
      values.push(data.credit_limit);
    }
    if (data.opening_balance !== undefined) {
      updateFields.push(`opening_balance = $${paramCount++}`);
      values.push(data.opening_balance);
    }
    if (data.google_location_link !== undefined) {
      updateFields.push(`google_location_link = $${paramCount++}`);
      values.push(data.google_location_link || null);
    }
    if (data.updated_by !== undefined) {
      updateFields.push(`updated_by = $${paramCount++}`);
      values.push(data.updated_by);
    }

    if (data.kyc_verification_details !== undefined) {
      mergedKyc = mergeEntityKycDetailsPatch(
        existing.kyc_verification_details,
        data.kyc_verification_details
      );
      updateFields.push(`kyc_verification_details = $${paramCount++}::jsonb`);
      values.push(JSON.stringify(mergedKyc));

      if (data.is_verified === undefined) {
        verifiedForStatus = isMasterVendorKycVerified(nextRegistrationType, mergedKyc);
        updateFields.push(`is_verified = $${paramCount++}`);
        values.push(verifiedForStatus);
        updateFields.push(`verified_at = $${paramCount++}`);
        values.push(verifiedForStatus ? new Date() : null);
      }

      // Lock address once GST snapshot lands
      if (
        (mergedKyc.gst_advanced || mergedKyc.gst) &&
        data.address_locked === undefined
      ) {
        updateFields.push(`address_locked = $${paramCount++}`);
        values.push(true);
      }
    } else if (data.registration_type !== undefined && data.is_verified === undefined) {
      verifiedForStatus = isMasterVendorKycVerified(
        data.registration_type,
        existing.kyc_verification_details
      );
      updateFields.push(`is_verified = $${paramCount++}`);
      values.push(verifiedForStatus);
      updateFields.push(`verified_at = $${paramCount++}`);
      values.push(verifiedForStatus ? new Date() : null);
    }

    if (data.is_verified !== undefined) {
      verifiedForStatus = data.is_verified;
      updateFields.push(`is_verified = $${paramCount++}`);
      values.push(data.is_verified);
      updateFields.push(`verified_at = $${paramCount++}`);
      values.push(data.is_verified ? data.verified_at || new Date() : null);
    }

    if (data.address_locked !== undefined) {
      updateFields.push(`address_locked = $${paramCount++}`);
      values.push(data.address_locked);
    }

    const isVerifiedFinal =
      verifiedForStatus !== undefined ? verifiedForStatus : existing.is_verified;
    if (data.status !== undefined || verifiedForStatus !== undefined) {
      const nextStatus = resolveMasterVendorStatus(
        isVerifiedFinal,
        data.status,
        existing.status
      );
      updateFields.push(`status = $${paramCount++}`);
      values.push(nextStatus);
      updateFields.push(`is_active = $${paramCount++}`);
      values.push(nextStatus === 'active');
    } else if (data.is_active !== undefined) {
      // Map legacy is_active boolean onto status when verified
      const mapped: MasterVendorStatus = data.is_active ? 'active' : 'inactive';
      const nextStatus = resolveMasterVendorStatus(
        isVerifiedFinal,
        mapped,
        existing.status
      );
      updateFields.push(`status = $${paramCount++}`);
      values.push(nextStatus);
      updateFields.push(`is_active = $${paramCount++}`);
      values.push(nextStatus === 'active');
    }

    if (updateFields.length === 0) {
      return existing;
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const query = `
      UPDATE packaging_vendors
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING ${COLUMNS}
    `;
    const result = await db.query(query, values);
    if (!result.rows[0]) return null;
    logger.info('Master vendor updated', { id });
    return transformVendor(result.rows[0]);
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.query('DELETE FROM packaging_vendors WHERE id = $1', [id]);
    const deleted = (result.rowCount || 0) > 0;
    if (deleted) logger.info('Master vendor deleted', { id });
    return deleted;
  }

  /** Soft-deactivate: set status inactive (preferred over delete). */
  async setStatus(id: string, status: MasterVendorStatus): Promise<MasterVendor | null> {
    return this.update(id, { status });
  }

  async businessNameExists(businessName: string, excludeId?: string): Promise<boolean> {
    const query = excludeId
      ? `SELECT 1 FROM packaging_vendors WHERE LOWER(TRIM(business_name)) = LOWER(TRIM($1)) AND id != $2 LIMIT 1`
      : `SELECT 1 FROM packaging_vendors WHERE LOWER(TRIM(business_name)) = LOWER(TRIM($1)) LIMIT 1`;
    const result = await db.query(query, excludeId ? [businessName, excludeId] : [businessName]);
    return result.rows.length > 0;
  }

  async gstExists(gstNumber: string, excludeId?: string): Promise<boolean> {
    const query = excludeId
      ? `SELECT 1 FROM packaging_vendors WHERE business_details->>'gst_number' = $1 AND id != $2 LIMIT 1`
      : `SELECT 1 FROM packaging_vendors WHERE business_details->>'gst_number' = $1 LIMIT 1`;
    const result = await db.query(query, excludeId ? [gstNumber, excludeId] : [gstNumber]);
    return result.rows.length > 0;
  }

  async panExists(panNumber: string, excludeId?: string): Promise<boolean> {
    const query = excludeId
      ? `SELECT 1 FROM packaging_vendors WHERE business_details->>'pan_number' = $1 AND id != $2 LIMIT 1`
      : `SELECT 1 FROM packaging_vendors WHERE business_details->>'pan_number' = $1 LIMIT 1`;
    const result = await db.query(query, excludeId ? [panNumber, excludeId] : [panNumber]);
    return result.rows.length > 0;
  }
}

export const packagingVendorDAO = new PackagingVendorDAO();
/** Alias for master-vendor naming */
export const masterVendorDAO = packagingVendorDAO;
