import { db } from '../database/connection';
import {
  SalesParty,
  CreateSalesPartyDTO,
  UpdateSalesPartyDTO,
  SalesPartyRegistrationType,
} from '../models/sales-party.model';
import {
  mergeEntityKycDetailsPatch,
  parseEntityKycDetails,
  isSalesPartyKycVerified,
  resolveSalesPartyIsActive,
} from '../utils/kyc-verification';
import { logger } from '../utils/logger';

const COLUMNS = `
  id, business_name, contact_persons, contact_person, email, phone, address, business_details,
  aadhar_number, registration_type, customer_type, bank_details, is_active, is_verified, verified_at,
  user_id, lead_id, created_at, updated_at, created_by, updated_by,
  last_enquiry_date, google_location_link, business_card_url, kyc_verification_details`;

export interface SalesPartyListFilters {
  includeInactive?: boolean;
  isVerified?: boolean;
  registrationType?: SalesPartyRegistrationType;
}

export class SalesPartyDAO {
  async findAll(filters: SalesPartyListFilters = {}): Promise<SalesParty[]> {
    const { includeInactive = false, isVerified, registrationType } = filters;

    let query = `
      SELECT ${COLUMNS}
      FROM sales_parties
      WHERE 1=1
    `;
    const params: unknown[] = [];
    let paramCount = 1;

    if (!includeInactive) {
      query += ` AND is_active = true`;
    }

    if (isVerified === true) {
      query += ` AND is_verified = true`;
    } else if (isVerified === false) {
      query += ` AND is_verified = false`;
    }

    if (registrationType) {
      query += ` AND registration_type = $${paramCount++}`;
      params.push(registrationType);
    }

    query += ` ORDER BY business_name ASC`;

    const result = await db.query<SalesParty>(query, params);
    return result.rows;
  }

  async findById(id: string): Promise<SalesParty | null> {
    const query = `SELECT ${COLUMNS} FROM sales_parties WHERE id = $1`;
    const result = await db.query<SalesParty>(query, [id]);
    return result.rows[0] || null;
  }

  async findByEmail(email: string): Promise<SalesParty | null> {
    const query = `SELECT ${COLUMNS} FROM sales_parties WHERE email = $1`;
    const result = await db.query<SalesParty>(query, [email]);
    return result.rows[0] || null;
  }

  async findByGST(gstNumber: string): Promise<SalesParty | null> {
    const query = `SELECT ${COLUMNS} FROM sales_parties WHERE business_details->>'gst_number' = $1`;
    const result = await db.query<SalesParty>(query, [gstNumber]);
    return result.rows[0] || null;
  }

  async findByPAN(panNumber: string): Promise<SalesParty | null> {
    const query = `SELECT ${COLUMNS} FROM sales_parties WHERE business_details->>'pan_number' = $1`;
    const result = await db.query<SalesParty>(query, [panNumber]);
    return result.rows[0] || null;
  }

  async create(data: CreateSalesPartyDTO & { user_id?: string }): Promise<SalesParty> {
    const first = data.contact_persons[0];
    const contactPersonName = first.name;
    const primaryPhone = first.phones[0];
    const primaryEmail = first.emails?.[0]?.trim() || null;

    const kycDetails = mergeEntityKycDetailsPatch({}, data.kyc_verification_details);
    const isVerified =
      data.is_verified !== undefined
        ? data.is_verified
        : isSalesPartyKycVerified(data.registration_type, kycDetails);
    const isActive = resolveSalesPartyIsActive(isVerified, data.is_active);

    const customerType =
      data.registration_type === 'retail' ? data.customer_type ?? null : null;

    const query = `
      INSERT INTO sales_parties (
        business_name, contact_persons, contact_person, email, phone, address, business_details,
        aadhar_number, registration_type, customer_type, bank_details, is_active, is_verified, verified_at,
        created_by, user_id, lead_id, google_location_link, business_card_url, kyc_verification_details
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING ${COLUMNS}
    `;
    const values = [
      data.business_name,
      JSON.stringify(data.contact_persons),
      contactPersonName,
      primaryEmail,
      primaryPhone,
      JSON.stringify(data.address),
      JSON.stringify(data.business_details ?? {}),
      data.aadhar_number || null,
      data.registration_type,
      customerType,
      data.bank_details ? JSON.stringify(data.bank_details) : null,
      isActive,
      isVerified,
      isVerified ? data.verified_at || new Date() : null,
      data.created_by || null,
      data.user_id || null,
      data.lead_id || null,
      data.google_location_link || null,
      data.business_card_url || null,
      JSON.stringify(kycDetails),
    ];

    const result = await db.query<SalesParty>(query, values);
    const row = result.rows[0];
    logger.info('Sales party created', {
      salesPartyId: row.id,
      business_name: row.business_name,
      registration_type: row.registration_type,
    });
    return row;
  }

  async update(id: string, data: UpdateSalesPartyDTO): Promise<SalesParty | null> {
    const updateFields: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;
    let verifiedForActiveSync: boolean | undefined;
    const explicitIsActive = data.is_active;

    if (data.business_name !== undefined) {
      updateFields.push(`business_name = $${paramCount++}`);
      values.push(data.business_name);
    }
    if (data.contact_persons !== undefined) {
      updateFields.push(`contact_persons = $${paramCount++}`);
      values.push(JSON.stringify(data.contact_persons));
      const first = data.contact_persons[0];
      if (first) {
        updateFields.push(`contact_person = $${paramCount++}`);
        values.push(first.name);
        updateFields.push(`phone = $${paramCount++}`);
        values.push(first.phones[0]);
        updateFields.push(`email = $${paramCount++}`);
        values.push(first.emails?.[0]?.trim() || null);
      }
    }
    if (data.address !== undefined) {
      updateFields.push(`address = $${paramCount++}`);
      values.push(JSON.stringify(data.address));
    }
    if (data.business_details !== undefined) {
      updateFields.push(`business_details = $${paramCount++}`);
      values.push(JSON.stringify(data.business_details));
    }
    if (data.aadhar_number !== undefined) {
      updateFields.push(`aadhar_number = $${paramCount++}`);
      values.push(data.aadhar_number || null);
    }
    if (data.registration_type !== undefined) {
      updateFields.push(`registration_type = $${paramCount++}`);
      values.push(data.registration_type);
      // Non-retail parties must not keep a customer_type.
      if (data.registration_type !== 'retail' && data.customer_type === undefined) {
        updateFields.push(`customer_type = $${paramCount++}`);
        values.push(null);
      }
    }
    if (data.customer_type !== undefined) {
      updateFields.push(`customer_type = $${paramCount++}`);
      values.push(data.customer_type || null);
    }
    if (data.bank_details !== undefined) {
      updateFields.push(`bank_details = $${paramCount++}`);
      values.push(JSON.stringify(data.bank_details));
    }
    if (data.is_verified !== undefined) {
      verifiedForActiveSync = data.is_verified;
      updateFields.push(`is_verified = $${paramCount++}`);
      values.push(data.is_verified);
      updateFields.push(`verified_at = $${paramCount++}`);
      values.push(data.is_verified ? data.verified_at || new Date() : null);
    }
    if (data.updated_by !== undefined) {
      updateFields.push(`updated_by = $${paramCount++}`);
      values.push(data.updated_by);
    }
    if (data.lead_id !== undefined) {
      updateFields.push(`lead_id = $${paramCount++}`);
      values.push(data.lead_id || null);
    }
    if (data.google_location_link !== undefined) {
      updateFields.push(`google_location_link = $${paramCount++}`);
      values.push(data.google_location_link || null);
    }
    if (data.business_card_url !== undefined) {
      updateFields.push(`business_card_url = $${paramCount++}`);
      values.push(data.business_card_url || null);
    }

    if (data.kyc_verification_details !== undefined) {
      const existingRow = await db.query<{
        kyc_verification_details: unknown;
        registration_type: SalesPartyRegistrationType;
      }>(
        `SELECT kyc_verification_details, registration_type FROM sales_parties WHERE id = $1`,
        [id]
      );
      const merged = mergeEntityKycDetailsPatch(
        parseEntityKycDetails(existingRow.rows[0]?.kyc_verification_details),
        data.kyc_verification_details
      );
      updateFields.push(`kyc_verification_details = $${paramCount++}::jsonb`);
      values.push(JSON.stringify(merged));

      if (data.is_verified === undefined) {
        const registrationType =
          data.registration_type ??
          existingRow.rows[0]?.registration_type ??
          'registered';
        verifiedForActiveSync = isSalesPartyKycVerified(registrationType, merged);
        updateFields.push(`is_verified = $${paramCount++}`);
        values.push(verifiedForActiveSync);
        updateFields.push(`verified_at = $${paramCount++}`);
        values.push(verifiedForActiveSync ? new Date() : null);
      }
    } else if (
      data.registration_type !== undefined &&
      data.is_verified === undefined
    ) {
      const existingRow = await db.query<{
        kyc_verification_details: unknown;
      }>(`SELECT kyc_verification_details FROM sales_parties WHERE id = $1`, [id]);
      const kyc = parseEntityKycDetails(existingRow.rows[0]?.kyc_verification_details);
      verifiedForActiveSync = isSalesPartyKycVerified(data.registration_type, kyc);
      updateFields.push(`is_verified = $${paramCount++}`);
      values.push(verifiedForActiveSync);
      updateFields.push(`verified_at = $${paramCount++}`);
      values.push(verifiedForActiveSync ? new Date() : null);
    }

    if (verifiedForActiveSync !== undefined) {
      updateFields.push(`is_active = $${paramCount++}`);
      values.push(resolveSalesPartyIsActive(verifiedForActiveSync, explicitIsActive));
    } else if (explicitIsActive !== undefined) {
      const existingRow = await db.query<{ is_verified: boolean }>(
        `SELECT is_verified FROM sales_parties WHERE id = $1`,
        [id]
      );
      const currentVerified = existingRow.rows[0]?.is_verified ?? false;
      updateFields.push(`is_active = $${paramCount++}`);
      values.push(resolveSalesPartyIsActive(currentVerified, explicitIsActive));
    }

    if (updateFields.length === 0) {
      return this.findById(id);
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const query = `
      UPDATE sales_parties SET ${updateFields.join(', ')} WHERE id = $${paramCount}
      RETURNING ${COLUMNS}
    `;
    const result = await db.query<SalesParty>(query, values);
    const row = result.rows[0] || null;
    if (row) logger.info('Sales party updated', { salesPartyId: row.id });
    return row;
  }

  async delete(id: string): Promise<void> {
    await db.query('DELETE FROM sales_parties WHERE id = $1', [id]);
    logger.info('Sales party deleted', { salesPartyId: id });
  }

  async emailExists(email: string, excludeId?: string): Promise<boolean> {
    const query = excludeId
      ? 'SELECT 1 FROM sales_parties WHERE email = $1 AND id != $2 LIMIT 1'
      : 'SELECT 1 FROM sales_parties WHERE email = $1 LIMIT 1';
    const result = await db.query(query, excludeId ? [email, excludeId] : [email]);
    return result.rows.length > 0;
  }

  async gstExists(gstNumber: string, excludeId?: string): Promise<boolean> {
    const query = excludeId
      ? `SELECT 1 FROM sales_parties WHERE business_details->>'gst_number' = $1 AND id != $2 LIMIT 1`
      : `SELECT 1 FROM sales_parties WHERE business_details->>'gst_number' = $1 LIMIT 1`;
    const result = await db.query(query, excludeId ? [gstNumber, excludeId] : [gstNumber]);
    return result.rows.length > 0;
  }

  async panExists(panNumber: string, excludeId?: string): Promise<boolean> {
    const query = excludeId
      ? `SELECT 1 FROM sales_parties WHERE business_details->>'pan_number' = $1 AND id != $2 LIMIT 1`
      : `SELECT 1 FROM sales_parties WHERE business_details->>'pan_number' = $1 LIMIT 1`;
    const result = await db.query(query, excludeId ? [panNumber, excludeId] : [panNumber]);
    return result.rows.length > 0;
  }

  async aadharExists(aadharNumber: string, excludeId?: string): Promise<boolean> {
    let query = `SELECT 1 FROM sales_parties WHERE aadhar_number = $1`;
    const params: unknown[] = [aadharNumber];

    if (excludeId) {
      query += ` AND id != $2`;
      params.push(excludeId);
    }

    query += ` LIMIT 1`;
    const result = await db.query(query, params);
    return result.rows.length > 0;
  }
}

export const salesPartyDAO = new SalesPartyDAO();
