import { db } from '../database/connection';
import {
  SalesParty,
  CreateSalesPartyDTO,
  UpdateSalesPartyDTO,
} from '../models/sales-party.model';
import { logger } from '../utils/logger';

const COLUMNS =
  'id, business_name, contact_persons, contact_person, email, phone, address, business_details, bank_details, is_active, user_id, lead_id, created_at, updated_at, created_by, updated_by, last_enquiry_date, google_location_link, business_card_url';

export class SalesPartyDAO {
  async findAll(includeInactive = false): Promise<SalesParty[]> {
    let query = `
      SELECT ${COLUMNS}
      FROM sales_parties
      WHERE 1=1
    `;
    const params: any[] = [];

    if (!includeInactive) {
      query += ` AND is_active = true`;
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

    const query = `
      INSERT INTO sales_parties (business_name, contact_persons, contact_person, email, phone, address, business_details, bank_details, is_active, created_by, user_id, lead_id, google_location_link, business_card_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING ${COLUMNS}
    `;
    const values = [
      data.business_name,
      JSON.stringify(data.contact_persons),
      contactPersonName,
      primaryEmail,
      primaryPhone,
      JSON.stringify(data.address),
      JSON.stringify(data.business_details),
      data.bank_details ? JSON.stringify(data.bank_details) : null,
      data.is_active !== undefined ? data.is_active : true,
      data.created_by || null,
      data.user_id || null,
      data.lead_id || null,
      data.google_location_link || null,
      data.business_card_url || null,
    ];

    const result = await db.query<SalesParty>(query, values);
    const row = result.rows[0];
    logger.info('Sales party created', { salesPartyId: row.id, business_name: row.business_name });
    return row;
  }

  async update(id: string, data: UpdateSalesPartyDTO): Promise<SalesParty | null> {
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

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
    if (data.bank_details !== undefined) {
      updateFields.push(`bank_details = $${paramCount++}`);
      values.push(JSON.stringify(data.bank_details));
    }
    if (data.is_active !== undefined) {
      updateFields.push(`is_active = $${paramCount++}`);
      values.push(data.is_active);
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
}

export const salesPartyDAO = new SalesPartyDAO();
