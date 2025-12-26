import { db } from '../database/connection';
import { Vendor, CreateVendorDTO, UpdateVendorDTO, VendorType } from '../models/vendor.model';
import { logger } from '../utils/logger';

export class VendorDAO {
  async findAll(includeInactive = false, type?: VendorType): Promise<Vendor[]> {
    let query = `
      SELECT id, business_name, contact_persons, contact_person, email, phone, address, business_details, 
             bank_details, type, is_active, user_id, lead_id, created_at, updated_at, created_by, updated_by,
             last_enquiry_date, google_location_link, business_card_url
      FROM vendors
      WHERE 1=1
    `;
    
    const params: any[] = [];
    let paramCount = 1;

    if (!includeInactive) {
      query += ` AND is_active = true`;
    }

    if (type) {
      query += ` AND type = $${paramCount++}`;
      params.push(type);
    }

    query += ` ORDER BY business_name ASC`;

    const result = await db.query<Vendor>(query, params);
    return result.rows;
  }

  async findById(id: string): Promise<Vendor | null> {
    const query = `
      SELECT id, business_name, contact_persons, contact_person, email, phone, address, business_details,
             bank_details, type, is_active, user_id, lead_id, created_at, updated_at, created_by, updated_by,
             last_enquiry_date, google_location_link, business_card_url
      FROM vendors
      WHERE id = $1
    `;
    const result = await db.query<Vendor>(query, [id]);
    return result.rows[0] || null;
  }

  async findByEmail(email: string): Promise<Vendor | null> {
    const query = `
      SELECT id, business_name, contact_persons, contact_person, email, phone, address, business_details,
             bank_details, type, is_active, user_id, lead_id, created_at, updated_at, created_by, updated_by,
             last_enquiry_date, google_location_link, business_card_url
      FROM vendors
      WHERE email = $1
    `;
    const result = await db.query<Vendor>(query, [email]);
    return result.rows[0] || null;
  }

  async findByGST(gstNumber: string): Promise<Vendor | null> {
    const query = `
      SELECT id, business_name, contact_persons, contact_person, email, phone, address, business_details,
             bank_details, type, is_active, user_id, lead_id, created_at, updated_at, created_by, updated_by,
             last_enquiry_date, google_location_link, business_card_url
      FROM vendors
      WHERE business_details->>'gst_number' = $1
    `;
    const result = await db.query<Vendor>(query, [gstNumber]);
    return result.rows[0] || null;
  }

  async findByPAN(panNumber: string): Promise<Vendor | null> {
    const query = `
      SELECT id, business_name, contact_persons, contact_person, email, phone, address, business_details,
             bank_details, type, is_active, user_id, lead_id, created_at, updated_at, created_by, updated_by,
             last_enquiry_date, google_location_link, business_card_url
      FROM vendors
      WHERE business_details->>'pan_number' = $1
    `;
    const result = await db.query<Vendor>(query, [panNumber]);
    return result.rows[0] || null;
  }

  async create(vendorData: CreateVendorDTO & { user_id?: string }): Promise<Vendor> {
    // Extract first contact person data for legacy fields
    const firstContactPerson = vendorData.contact_persons[0];
    const contactPersonName = firstContactPerson.name;
    const primaryPhone = firstContactPerson.phones[0];
    const primaryEmail = firstContactPerson.emails?.[0]?.trim() || null;

    const query = `
      INSERT INTO vendors (business_name, contact_persons, contact_person, email, phone, address, business_details, 
                          bank_details, type, is_active, created_by, user_id, lead_id, google_location_link, business_card_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id, business_name, contact_persons, contact_person, email, phone, address, business_details,
                bank_details, type, is_active, user_id, lead_id, created_at, updated_at, created_by, updated_by,
                last_enquiry_date, google_location_link, business_card_url
    `;
    
    const values = [
      vendorData.business_name,
      JSON.stringify(vendorData.contact_persons),
      contactPersonName,
      primaryEmail,
      primaryPhone,
      JSON.stringify(vendorData.address),
      JSON.stringify(vendorData.business_details),
      vendorData.bank_details ? JSON.stringify(vendorData.bank_details) : null,
      vendorData.type,
      vendorData.is_active !== undefined ? vendorData.is_active : true,
      vendorData.created_by || null,
      vendorData.user_id || null,
      vendorData.lead_id || null,
      vendorData.google_location_link || null,
      vendorData.business_card_url || null
    ];

    const result = await db.query<Vendor>(query, values);
    const vendor = result.rows[0];

    logger.info('Vendor created', {
      vendorId: vendor.id,
      business_name: vendor.business_name,
      type: vendor.type
    });

    return vendor;
  }

  async update(id: string, vendorData: UpdateVendorDTO): Promise<Vendor | null> {
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (vendorData.business_name !== undefined) {
      updateFields.push(`business_name = $${paramCount++}`);
      values.push(vendorData.business_name);
    }

    if (vendorData.contact_persons !== undefined) {
      updateFields.push(`contact_persons = $${paramCount++}`);
      values.push(JSON.stringify(vendorData.contact_persons));
      
      // Also update legacy fields from first contact person
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

    if (vendorData.bank_details !== undefined) {
      updateFields.push(`bank_details = $${paramCount++}`);
      values.push(JSON.stringify(vendorData.bank_details));
    }

    if (vendorData.type !== undefined) {
      updateFields.push(`type = $${paramCount++}`);
      values.push(vendorData.type);
    }

    if (vendorData.is_active !== undefined) {
      updateFields.push(`is_active = $${paramCount++}`);
      values.push(vendorData.is_active);
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

    if (updateFields.length === 0) {
      return await this.findById(id);
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE vendors 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, business_name, contact_persons, contact_person, email, phone, address, business_details,
                bank_details, type, is_active, user_id, lead_id, created_at, updated_at, created_by, updated_by,
                last_enquiry_date, google_location_link, business_card_url
    `;

    const result = await db.query<Vendor>(query, values);
    const vendor = result.rows[0];

    if (vendor) {
      logger.info('Vendor updated', {
        vendorId: vendor.id,
        business_name: vendor.business_name
      });
    }

    return vendor || null;
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
}

export const vendorDAO = new VendorDAO();
