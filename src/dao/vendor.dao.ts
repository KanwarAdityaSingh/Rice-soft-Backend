import { db } from '../database/connection';
import {
  Vendor,
  CreateVendorDTO,
  UpdateVendorDTO,
  VendorType,
  VendorRegistrationType,
} from '../models/vendor.model';
import {
  mergeEntityKycDetailsPatch,
  parseEntityKycDetails,
  isVendorKycVerified,
  resolveEntityIsActiveFromKyc,
} from '../utils/kyc-verification';
import { logger } from '../utils/logger';

const VENDOR_SELECT_COLUMNS = `
      id, business_name, contact_persons, contact_person, email, phone, address, business_details,
             aadhar_number, registration_type, bank_details, type, is_active, is_verified, verified_at,
             user_id, lead_id, created_at, updated_at, created_by, updated_by,
             last_enquiry_date, google_location_link, business_card_url,
             bank_details_verified_at, bank_details_verified_by, bank_verification_error,
             kyc_verification_details`;

export interface VendorListFilters {
  includeInactive?: boolean;
  type?: VendorType;
  bankVerified?: boolean;
  isVerified?: boolean;
  registrationType?: VendorRegistrationType;
}

export class VendorDAO {
  async findAll(filters: VendorListFilters = {}): Promise<Vendor[]> {
    const {
      includeInactive = false,
      type,
      bankVerified,
      isVerified,
      registrationType,
    } = filters;

    let query = `
      SELECT ${VENDOR_SELECT_COLUMNS}
      FROM vendors
      WHERE 1=1
    `;

    const params: unknown[] = [];
    let paramCount = 1;

    if (!includeInactive) {
      query += ` AND is_active = true`;
    }

    if (type) {
      query += ` AND type = $${paramCount++}`;
      params.push(type);
    }

    if (bankVerified === true) {
      query += ` AND bank_details_verified_at IS NOT NULL`;
    } else if (bankVerified === false) {
      query += ` AND bank_details_verified_at IS NULL`;
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

    const result = await db.query<Vendor>(query, params);
    return result.rows;
  }

  async findById(id: string): Promise<Vendor | null> {
    const query = `
      SELECT ${VENDOR_SELECT_COLUMNS}
      FROM vendors
      WHERE id = $1
    `;
    const result = await db.query<Vendor>(query, [id]);
    return result.rows[0] || null;
  }

  async findByEmail(email: string): Promise<Vendor | null> {
    const query = `
      SELECT ${VENDOR_SELECT_COLUMNS}
      FROM vendors
      WHERE email = $1
    `;
    const result = await db.query<Vendor>(query, [email]);
    return result.rows[0] || null;
  }

  async findByGST(gstNumber: string): Promise<Vendor | null> {
    const query = `
      SELECT ${VENDOR_SELECT_COLUMNS}
      FROM vendors
      WHERE business_details->>'gst_number' = $1
    `;
    const result = await db.query<Vendor>(query, [gstNumber]);
    return result.rows[0] || null;
  }

  async findByPAN(panNumber: string): Promise<Vendor | null> {
    const query = `
      SELECT ${VENDOR_SELECT_COLUMNS}
      FROM vendors
      WHERE business_details->>'pan_number' = $1
    `;
    const result = await db.query<Vendor>(query, [panNumber]);
    return result.rows[0] || null;
  }

  async create(vendorData: CreateVendorDTO & { user_id?: string }): Promise<Vendor> {
    const firstContactPerson = vendorData.contact_persons[0];
    const contactPersonName = firstContactPerson.name;
    const primaryPhone = firstContactPerson.phones[0];
    const primaryEmail = firstContactPerson.emails?.[0]?.trim() || null;

    const kycDetails = mergeEntityKycDetailsPatch({}, vendorData.kyc_verification_details);
    const isVerified =
      vendorData.is_verified !== undefined
        ? vendorData.is_verified
        : isVendorKycVerified(vendorData.registration_type, kycDetails);
    const isActive = resolveEntityIsActiveFromKyc(isVerified, vendorData.is_active);

    const query = `
      INSERT INTO vendors (business_name, contact_persons, contact_person, email, phone, address, business_details,
                          aadhar_number, registration_type, bank_details, type, is_active, is_verified, verified_at,
                          created_by, user_id, lead_id, google_location_link, business_card_url,
                          kyc_verification_details)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING ${VENDOR_SELECT_COLUMNS}
    `;

    const values = [
      vendorData.business_name,
      JSON.stringify(vendorData.contact_persons),
      contactPersonName,
      primaryEmail,
      primaryPhone,
      JSON.stringify(vendorData.address),
      JSON.stringify(vendorData.business_details),
      vendorData.aadhar_number || null,
      vendorData.registration_type,
      vendorData.bank_details ? JSON.stringify(vendorData.bank_details) : null,
      vendorData.type,
      isActive,
      isVerified,
      isVerified ? vendorData.verified_at || new Date() : null,
      vendorData.created_by || null,
      vendorData.user_id || null,
      vendorData.lead_id || null,
      vendorData.google_location_link || null,
      vendorData.business_card_url || null,
      JSON.stringify(kycDetails),
    ];

    const result = await db.query<Vendor>(query, values);
    const vendor = result.rows[0];

    logger.info('Vendor created', {
      vendorId: vendor.id,
      business_name: vendor.business_name,
      type: vendor.type,
      registration_type: vendor.registration_type,
    });

    return vendor;
  }

  async update(id: string, vendorData: UpdateVendorDTO): Promise<Vendor | null> {
    const updateFields: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;
    let verifiedForActiveSync: boolean | undefined;
    const explicitIsActive = vendorData.is_active;

    if (vendorData.business_name !== undefined) {
      updateFields.push(`business_name = $${paramCount++}`);
      values.push(vendorData.business_name);
    }

    if (vendorData.contact_persons !== undefined) {
      updateFields.push(`contact_persons = $${paramCount++}`);
      values.push(JSON.stringify(vendorData.contact_persons));

      const firstContactPerson = vendorData.contact_persons[0];
      if (firstContactPerson) {
        updateFields.push(`contact_person = $${paramCount++}`);
        values.push(firstContactPerson.name);
        updateFields.push(`phone = $${paramCount++}`);
        values.push(firstContactPerson.phones[0]);
        updateFields.push(`email = $${paramCount++}`);
        values.push(firstContactPerson.emails?.[0]?.trim() || null);
      }
    }

    if (vendorData.address !== undefined) {
      updateFields.push(`address = $${paramCount++}`);
      values.push(JSON.stringify(vendorData.address));
    }

    if (vendorData.business_details !== undefined) {
      updateFields.push(`business_details = $${paramCount++}`);
      values.push(JSON.stringify(vendorData.business_details));
    }

    if (vendorData.aadhar_number !== undefined) {
      updateFields.push(`aadhar_number = $${paramCount++}`);
      values.push(vendorData.aadhar_number || null);
    }

    if (vendorData.registration_type !== undefined) {
      updateFields.push(`registration_type = $${paramCount++}`);
      values.push(vendorData.registration_type);
    }

    if (vendorData.bank_details !== undefined) {
      updateFields.push(`bank_details = $${paramCount++}`);
      values.push(JSON.stringify(vendorData.bank_details));
      updateFields.push(`bank_details_verified_at = NULL`);
      updateFields.push(`bank_details_verified_by = NULL`);
      updateFields.push(`bank_verification_error = NULL`);
    }

    if (vendorData.type !== undefined) {
      updateFields.push(`type = $${paramCount++}`);
      values.push(vendorData.type);
    }

    if (vendorData.is_verified !== undefined) {
      verifiedForActiveSync = vendorData.is_verified;
      updateFields.push(`is_verified = $${paramCount++}`);
      values.push(vendorData.is_verified);
      updateFields.push(`verified_at = $${paramCount++}`);
      values.push(
        vendorData.is_verified ? vendorData.verified_at || new Date() : null
      );
    }

    if (vendorData.updated_by !== undefined) {
      updateFields.push(`updated_by = $${paramCount++}`);
      values.push(vendorData.updated_by);
    }

    if (vendorData.lead_id !== undefined) {
      updateFields.push(`lead_id = $${paramCount++}`);
      values.push(vendorData.lead_id || null);
    }

    if (vendorData.google_location_link !== undefined) {
      updateFields.push(`google_location_link = $${paramCount++}`);
      values.push(vendorData.google_location_link || null);
    }

    if (vendorData.business_card_url !== undefined) {
      updateFields.push(`business_card_url = $${paramCount++}`);
      values.push(vendorData.business_card_url || null);
    }

    if (vendorData.kyc_verification_details !== undefined) {
      const existingRow = await db.query<{
        kyc_verification_details: unknown;
        registration_type: VendorRegistrationType;
      }>(
        `SELECT kyc_verification_details, registration_type FROM vendors WHERE id = $1`,
        [id]
      );
      const merged = mergeEntityKycDetailsPatch(
        parseEntityKycDetails(existingRow.rows[0]?.kyc_verification_details),
        vendorData.kyc_verification_details
      );
      updateFields.push(`kyc_verification_details = $${paramCount++}::jsonb`);
      values.push(JSON.stringify(merged));

      if (vendorData.is_verified === undefined) {
        const registrationType =
          vendorData.registration_type ??
          existingRow.rows[0]?.registration_type ??
          'registered';
        verifiedForActiveSync = isVendorKycVerified(registrationType, merged);
        updateFields.push(`is_verified = $${paramCount++}`);
        values.push(verifiedForActiveSync);
        updateFields.push(`verified_at = $${paramCount++}`);
        values.push(verifiedForActiveSync ? new Date() : null);
      }
    } else if (
      vendorData.registration_type !== undefined &&
      vendorData.is_verified === undefined
    ) {
      const existingRow = await db.query<{ kyc_verification_details: unknown }>(
        `SELECT kyc_verification_details FROM vendors WHERE id = $1`,
        [id]
      );
      const kyc = parseEntityKycDetails(existingRow.rows[0]?.kyc_verification_details);
      verifiedForActiveSync = isVendorKycVerified(vendorData.registration_type, kyc);
      updateFields.push(`is_verified = $${paramCount++}`);
      values.push(verifiedForActiveSync);
      updateFields.push(`verified_at = $${paramCount++}`);
      values.push(verifiedForActiveSync ? new Date() : null);
    }

    if (verifiedForActiveSync !== undefined) {
      updateFields.push(`is_active = $${paramCount++}`);
      values.push(resolveEntityIsActiveFromKyc(verifiedForActiveSync, explicitIsActive));
    } else if (explicitIsActive !== undefined) {
      const existingRow = await db.query<{ is_verified: boolean }>(
        `SELECT is_verified FROM vendors WHERE id = $1`,
        [id]
      );
      const currentVerified = existingRow.rows[0]?.is_verified ?? false;
      updateFields.push(`is_active = $${paramCount++}`);
      values.push(resolveEntityIsActiveFromKyc(currentVerified, explicitIsActive));
    }

    if (updateFields.length === 0) {
      return await this.findById(id);
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE vendors
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING ${VENDOR_SELECT_COLUMNS}
    `;

    const result = await db.query<Vendor>(query, values);
    const vendor = result.rows[0];

    if (vendor) {
      logger.info('Vendor updated', {
        vendorId: vendor.id,
        business_name: vendor.business_name,
      });
    }

    return vendor || null;
  }

  /** Call after Surepass confirms the vendor's stored account + IFSC. */
  async markBankDetailsVerified(id: string, verifiedByUserId: string): Promise<Vendor | null> {
    const query = `
      UPDATE vendors
      SET bank_details_verified_at = CURRENT_TIMESTAMP,
          bank_details_verified_by = $2,
          bank_verification_error = NULL,
          is_active = CASE WHEN is_verified THEN true ELSE is_active END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING ${VENDOR_SELECT_COLUMNS}
    `;
    const result = await db.query<Vendor>(query, [id, verifiedByUserId]);
    const row = result.rows[0];
    if (row) {
      logger.info('Vendor bank details marked verified', { vendorId: id });
    }
    return row || null;
  }

  async setBankVerificationError(id: string, message: string | null): Promise<Vendor | null> {
    const query =
      message === null
        ? `
      UPDATE vendors
      SET bank_verification_error = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING ${VENDOR_SELECT_COLUMNS}
    `
        : `
      UPDATE vendors
      SET bank_verification_error = $2,
          is_active = false,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING ${VENDOR_SELECT_COLUMNS}
    `;
    const result = await db.query<Vendor>(query, [id, message]);
    return result.rows[0] || null;
  }

  async deactivatePurchaserVendorIfBankUnverified(vendorId: string): Promise<Vendor | null> {
    const query = `
      UPDATE vendors v
      SET is_active = false,
          updated_at = CURRENT_TIMESTAMP
      WHERE v.id = $1
        AND v.bank_details IS NOT NULL
        AND v.bank_details_verified_at IS NULL
        AND EXISTS (SELECT 1 FROM saudas s WHERE s.purchaser_id = v.id)
      RETURNING ${VENDOR_SELECT_COLUMNS}
    `;
    const result = await db.query<Vendor>(query, [vendorId]);
    const row = result.rows[0];
    if (row) {
      logger.info('Purchaser vendor deactivated: bank on file but not verified', { vendorId });
    }
    return row || null;
  }

  async delete(id: string): Promise<void> {
    const query = 'DELETE FROM vendors WHERE id = $1';
    await db.query(query, [id]);

    logger.info('Vendor deleted', { vendorId: id });
  }

  async emailExists(email: string, excludeId?: string): Promise<boolean> {
    const query = excludeId
      ? 'SELECT 1 FROM vendors WHERE email = $1 AND id != $2 LIMIT 1'
      : 'SELECT 1 FROM vendors WHERE email = $1 LIMIT 1';

    const values = excludeId ? [email, excludeId] : [email];
    const result = await db.query(query, values);
    return result.rows.length > 0;
  }

  async gstExists(gstNumber: string, excludeId?: string): Promise<boolean> {
    const query = excludeId
      ? `SELECT 1 FROM vendors WHERE business_details->>'gst_number' = $1 AND id != $2 LIMIT 1`
      : `SELECT 1 FROM vendors WHERE business_details->>'gst_number' = $1 LIMIT 1`;

    const values = excludeId ? [gstNumber, excludeId] : [gstNumber];
    const result = await db.query(query, values);
    return result.rows.length > 0;
  }

  async panExists(panNumber: string, excludeId?: string): Promise<boolean> {
    const query = excludeId
      ? `SELECT 1 FROM vendors WHERE business_details->>'pan_number' = $1 AND id != $2 LIMIT 1`
      : `SELECT 1 FROM vendors WHERE business_details->>'pan_number' = $1 LIMIT 1`;

    const values = excludeId ? [panNumber, excludeId] : [panNumber];
    const result = await db.query(query, values);
    return result.rows.length > 0;
  }

  async aadharExists(aadharNumber: string, excludeId?: string): Promise<boolean> {
    let query = `SELECT 1 FROM vendors WHERE aadhar_number = $1`;
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

export const vendorDAO = new VendorDAO();
