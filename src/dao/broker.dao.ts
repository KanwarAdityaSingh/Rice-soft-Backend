import { db } from '../database/connection';
import { Broker, CreateBrokerDTO, UpdateBrokerDTO, BrokerType } from '../models/broker.model';
import { logger } from '../utils/logger';

export class BrokerDAO {
  async findAll(includeInactive = false, type?: BrokerType): Promise<Broker[]> {
    let query = `
      SELECT id, business_name, contact_person, email, phone, address, business_details, 
             broker_details, type, is_active, user_id, created_at, updated_at, created_by, updated_by
      FROM brokers
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

    const result = await db.query<Broker>(query, params);
    return result.rows;
  }

  async findById(id: string): Promise<Broker | null> {
    const query = `
      SELECT id, business_name, contact_person, email, phone, address, business_details,
             broker_details, type, is_active, created_at, updated_at, created_by, updated_by
      FROM brokers
      WHERE id = $1
    `;
    const result = await db.query<Broker>(query, [id]);
    return result.rows[0] || null;
  }

  async findByEmail(email: string): Promise<Broker | null> {
    const query = `
      SELECT id, business_name, contact_person, email, phone, address, business_details,
             broker_details, type, is_active, created_at, updated_at, created_by, updated_by
      FROM brokers
      WHERE email = $1
    `;
    const result = await db.query<Broker>(query, [email]);
    return result.rows[0] || null;
  }

  async findByGST(gstNumber: string): Promise<Broker | null> {
    const query = `
      SELECT id, business_name, contact_person, email, phone, address, business_details,
             broker_details, type, is_active, created_at, updated_at, created_by, updated_by
      FROM brokers
      WHERE business_details->>'gst_number' = $1
    `;
    const result = await db.query<Broker>(query, [gstNumber]);
    return result.rows[0] || null;
  }

  async findByPAN(panNumber: string): Promise<Broker | null> {
    const query = `
      SELECT id, business_name, contact_person, email, phone, address, business_details,
             broker_details, type, is_active, created_at, updated_at, created_by, updated_by
      FROM brokers
      WHERE business_details->>'pan_number' = $1
    `;
    const result = await db.query<Broker>(query, [panNumber]);
    return result.rows[0] || null;
  }

  async create(brokerData: CreateBrokerDTO & { user_id?: string }): Promise<Broker> {
    const query = `
      INSERT INTO brokers (business_name, contact_person, email, phone, address, business_details, 
                          broker_details, type, is_active, created_by, user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id, business_name, contact_person, email, phone, address, business_details,
                broker_details, type, is_active, user_id, created_at, updated_at, created_by, updated_by
    `;
    
    const values = [
      brokerData.business_name,
      brokerData.contact_person,
      brokerData.email,
      brokerData.phone,
      JSON.stringify(brokerData.address),
      JSON.stringify(brokerData.business_details),
      brokerData.broker_details ? JSON.stringify(brokerData.broker_details) : null,
      brokerData.type,
      brokerData.is_active !== undefined ? brokerData.is_active : true,
      brokerData.created_by || null,
      brokerData.user_id || null
    ];

    const result = await db.query<Broker>(query, values);
    const broker = result.rows[0];

    logger.info('Broker created', {
      brokerId: broker.id,
      business_name: broker.business_name,
      type: broker.type
    });

    return broker;
  }

  async update(id: string, brokerData: UpdateBrokerDTO): Promise<Broker | null> {
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (brokerData.business_name !== undefined) {
      updateFields.push(`business_name = $${paramCount++}`);
      values.push(brokerData.business_name);
    }

    if (brokerData.contact_person !== undefined) {
      updateFields.push(`contact_person = $${paramCount++}`);
      values.push(brokerData.contact_person);
    }

    if (brokerData.email !== undefined) {
      updateFields.push(`email = $${paramCount++}`);
      values.push(brokerData.email);
    }

    if (brokerData.phone !== undefined) {
      updateFields.push(`phone = $${paramCount++}`);
      values.push(brokerData.phone);
    }

    if (brokerData.address !== undefined) {
      updateFields.push(`address = $${paramCount++}`);
      values.push(JSON.stringify(brokerData.address));
    }

    if (brokerData.business_details !== undefined) {
      updateFields.push(`business_details = $${paramCount++}`);
      values.push(JSON.stringify(brokerData.business_details));
    }

    if (brokerData.broker_details !== undefined) {
      updateFields.push(`broker_details = $${paramCount++}`);
      values.push(JSON.stringify(brokerData.broker_details));
    }

    if (brokerData.type !== undefined) {
      updateFields.push(`type = $${paramCount++}`);
      values.push(brokerData.type);
    }

    if (brokerData.is_active !== undefined) {
      updateFields.push(`is_active = $${paramCount++}`);
      values.push(brokerData.is_active);
    }

    if (brokerData.updated_by !== undefined) {
      updateFields.push(`updated_by = $${paramCount++}`);
      values.push(brokerData.updated_by);
    }

    if (updateFields.length === 0) {
      return await this.findById(id);
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE brokers 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, business_name, contact_person, email, phone, address, business_details,
                broker_details, type, is_active, created_at, updated_at, created_by, updated_by
    `;

    const result = await db.query<Broker>(query, values);
    const broker = result.rows[0];

    if (broker) {
      logger.info('Broker updated', {
        brokerId: broker.id,
        business_name: broker.business_name
      });
    }

    return broker || null;
  }

  async delete(id: string): Promise<void> {
    const query = 'DELETE FROM brokers WHERE id = $1';
    await db.query(query, [id]);
    
    logger.info('Broker deleted', { brokerId: id });
  }

  async emailExists(email: string, excludeId?: string): Promise<boolean> {
    const query = excludeId 
      ? 'SELECT 1 FROM brokers WHERE email = $1 AND id != $2 LIMIT 1'
      : 'SELECT 1 FROM brokers WHERE email = $1 LIMIT 1';
    
    const values = excludeId ? [email, excludeId] : [email];
    const result = await db.query(query, values);
    return result.rows.length > 0;
  }

  async gstExists(gstNumber: string, excludeId?: string): Promise<boolean> {
    const query = excludeId 
      ? `SELECT 1 FROM brokers WHERE business_details->>'gst_number' = $1 AND id != $2 LIMIT 1`
      : `SELECT 1 FROM brokers WHERE business_details->>'gst_number' = $1 LIMIT 1`;
    
    const values = excludeId ? [gstNumber, excludeId] : [gstNumber];
    const result = await db.query(query, values);
    return result.rows.length > 0;
  }

  async panExists(panNumber: string, excludeId?: string): Promise<boolean> {
    const query = excludeId 
      ? `SELECT 1 FROM brokers WHERE business_details->>'pan_number' = $1 AND id != $2 LIMIT 1`
      : `SELECT 1 FROM brokers WHERE business_details->>'pan_number' = $1 LIMIT 1`;
    
    const values = excludeId ? [panNumber, excludeId] : [panNumber];
    const result = await db.query(query, values);
    return result.rows.length > 0;
  }
}

export const brokerDAO = new BrokerDAO();

