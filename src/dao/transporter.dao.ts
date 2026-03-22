import { db } from '../database/connection';
import { Transporter, CreateTransporterDTO, UpdateTransporterDTO } from '../models/transporter.model';
import { logger } from '../utils/logger';

export class TransporterDAO {
  async findAll(includeInactive = false): Promise<Transporter[]> {
    let query = `
      SELECT id, business_name, contact_persons, contact_person, phone, email, address, gst_number, pan_number,
             aadhar_number, transport_type, vehicle_numbers, vehicle_ids, bank_details, is_active, created_at, updated_at, created_by, updated_by
      FROM transporters
      WHERE 1=1
    `;
    
    const params: any[] = [];

    if (!includeInactive) {
      query += ` AND is_active = true`;
    }

    query += ` ORDER BY business_name ASC`;

    const result = await db.query<Transporter>(query, params);
    return result.rows;
  }

  async findById(id: string): Promise<Transporter | null> {
    const query = `
      SELECT id, business_name, contact_persons, contact_person, phone, email, address, gst_number, pan_number,
             aadhar_number, transport_type, vehicle_numbers, vehicle_ids, bank_details, is_active, created_at, updated_at, created_by, updated_by
      FROM transporters
      WHERE id = $1
    `;
    const result = await db.query<Transporter>(query, [id]);
    return result.rows[0] || null;
  }

  async findByEmail(email: string): Promise<Transporter | null> {
    const query = `
      SELECT id, business_name, contact_persons, contact_person, phone, email, address, gst_number, pan_number,
             aadhar_number, transport_type, vehicle_numbers, vehicle_ids, bank_details, is_active, created_at, updated_at, created_by, updated_by
      FROM transporters
      WHERE email = $1
    `;
    const result = await db.query<Transporter>(query, [email]);
    return result.rows[0] || null;
  }

  async emailExists(email: string, excludeId?: string): Promise<boolean> {
    let query = `SELECT 1 FROM transporters WHERE email = $1`;
    const params: any[] = [email];
    
    if (excludeId) {
      query += ` AND id != $2`;
      params.push(excludeId);
    }
    
    query += ` LIMIT 1`;
    const result = await db.query(query, params);
    return result.rows.length > 0;
  }

  async create(transporterData: CreateTransporterDTO): Promise<Transporter> {
    const persons = transporterData.contact_persons ?? [];
    const firstContactPerson = persons[0];
    const contactPersonName = firstContactPerson?.name ?? '';
    const primaryPhone = firstContactPerson?.phones?.[0] ?? '';
    const primaryEmail = firstContactPerson?.emails?.[0] || null;

    const query = `
      INSERT INTO transporters (business_name, contact_persons, contact_person, phone, email, address, gst_number,
                              pan_number, aadhar_number, transport_type, vehicle_numbers, vehicle_ids, bank_details, is_active, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id, business_name, contact_persons, contact_person, phone, email, address, gst_number, pan_number,
                aadhar_number, transport_type, vehicle_numbers, vehicle_ids, bank_details, is_active, created_at, updated_at, created_by, updated_by
    `;
    
    const values = [
      transporterData.business_name,
      JSON.stringify(persons),
      contactPersonName,
      primaryPhone,
      primaryEmail,
      JSON.stringify(transporterData.address),
      transporterData.gst_number || null,
      transporterData.pan_number || null,
      transporterData.aadhar_number || null,
      transporterData.transport_type,
      JSON.stringify(transporterData.vehicle_numbers || []),
      transporterData.vehicle_ids || [],
      JSON.stringify(transporterData.bank_details || {}),
      transporterData.is_active !== undefined ? transporterData.is_active : true,
      transporterData.created_by || null,
    ];

    try {
      const result = await db.query<Transporter>(query, values);
      logger.info('Transporter created', { id: result.rows[0].id });
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating transporter', { error, transporterData });
      throw error;
    }
  }

  async update(id: string, transporterData: UpdateTransporterDTO): Promise<Transporter | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (transporterData.business_name !== undefined) {
      fields.push(`business_name = $${paramCount++}`);
      values.push(transporterData.business_name);
    }
    if (transporterData.contact_persons !== undefined) {
      // Update contact_persons and legacy fields
      fields.push(`contact_persons = $${paramCount++}`);
      values.push(JSON.stringify(transporterData.contact_persons));
      
      // Extract first contact person for legacy fields
      const firstContactPerson = transporterData.contact_persons[0];
      if (firstContactPerson) {
        fields.push(`contact_person = $${paramCount++}`);
        values.push(firstContactPerson.name);
        fields.push(`phone = $${paramCount++}`);
        values.push(firstContactPerson.phones[0]);
        fields.push(`email = $${paramCount++}`);
        values.push(firstContactPerson.emails?.[0] || null);
      }
    }
    if (transporterData.address !== undefined) {
      fields.push(`address = $${paramCount++}`);
      values.push(JSON.stringify(transporterData.address));
    }
    if (transporterData.gst_number !== undefined) {
      fields.push(`gst_number = $${paramCount++}`);
      values.push(transporterData.gst_number || null);
    }
    if (transporterData.pan_number !== undefined) {
      fields.push(`pan_number = $${paramCount++}`);
      values.push(transporterData.pan_number || null);
    }
    if (transporterData.aadhar_number !== undefined) {
      fields.push(`aadhar_number = $${paramCount++}`);
      values.push(transporterData.aadhar_number || null);
    }
    if (transporterData.transport_type !== undefined) {
      fields.push(`transport_type = $${paramCount++}`);
      values.push(transporterData.transport_type);
    }
    if (transporterData.vehicle_numbers !== undefined) {
      fields.push(`vehicle_numbers = $${paramCount++}`);
      values.push(JSON.stringify(transporterData.vehicle_numbers));
    }
    if (transporterData.vehicle_ids !== undefined) {
      fields.push(`vehicle_ids = $${paramCount++}`);
      values.push(transporterData.vehicle_ids);
    }
    if (transporterData.bank_details !== undefined) {
      fields.push(`bank_details = $${paramCount++}`);
      values.push(JSON.stringify(transporterData.bank_details));
    }
    if (transporterData.is_active !== undefined) {
      fields.push(`is_active = $${paramCount++}`);
      values.push(transporterData.is_active);
    }
    if (transporterData.updated_by !== undefined) {
      fields.push(`updated_by = $${paramCount++}`);
      values.push(transporterData.updated_by);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE transporters
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, business_name, contact_persons, contact_person, phone, email, address, gst_number, pan_number,
                aadhar_number, transport_type, vehicle_numbers, vehicle_ids, bank_details, is_active, created_at, updated_at, created_by, updated_by
    `;

    try {
      const result = await db.query<Transporter>(query, values);
      if (result.rows.length === 0) {
        return null;
      }
      logger.info('Transporter updated', { id });
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating transporter', { error, id });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    const query = `DELETE FROM transporters WHERE id = $1`;
    const result = await db.query(query, [id]);
    const deleted = (result.rowCount || 0) > 0;
    if (deleted) {
      logger.info('Transporter deleted', { id });
    }
    return deleted;
  }

  async gstExists(gstNumber: string, excludeId?: string): Promise<boolean> {
    let query = `SELECT 1 FROM transporters WHERE gst_number = $1`;
    const params: any[] = [gstNumber];
    
    if (excludeId) {
      query += ` AND id != $2`;
      params.push(excludeId);
    }
    
    query += ` LIMIT 1`;
    const result = await db.query(query, params);
    return result.rows.length > 0;
  }

  async panExists(panNumber: string, excludeId?: string): Promise<boolean> {
    let query = `SELECT 1 FROM transporters WHERE pan_number = $1`;
    const params: any[] = [panNumber];
    
    if (excludeId) {
      query += ` AND id != $2`;
      params.push(excludeId);
    }
    
    query += ` LIMIT 1`;
    const result = await db.query(query, params);
    return result.rows.length > 0;
  }

  async aadharExists(aadharNumber: string, excludeId?: string): Promise<boolean> {
    let query = `SELECT 1 FROM transporters WHERE aadhar_number = $1`;
    const params: any[] = [aadharNumber];
    
    if (excludeId) {
      query += ` AND id != $2`;
      params.push(excludeId);
    }
    
    query += ` LIMIT 1`;
    const result = await db.query(query, params);
    return result.rows.length > 0;
  }
}

export const transporterDAO = new TransporterDAO();

