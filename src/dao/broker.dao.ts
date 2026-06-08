import { db } from '../database/connection';
import { Broker, CreateBrokerDTO, UpdateBrokerDTO, BrokerType, ContactPerson } from '../models/broker.model';
import { parseEntityKycDetails, mergeEntityKycDetailsPatch } from '../utils/kyc-verification';
import { logger } from '../utils/logger';

const BROKER_SELECT_COLUMNS = `
      id, business_name, contact_persons, email, phone, address, business_details,
             bank_details, broker_details, type, is_active, user_id, created_at, updated_at, created_by, updated_by,
             bank_details_verified_at, bank_details_verified_by, bank_verification_error,
             kyc_verification_details`;

export class BrokerDAO {
  /**
   * Transform contact_persons from database (JSONB or string) to ContactPerson[]
   * Handles migration from old format (phone: string) to new format (phones: string[])
   */
  private transformContactPersons(data: any): ContactPerson[] {
    if (!data) return [];
    
    // If it's already an array, transform each item
    if (Array.isArray(data)) {
      return data.map((item: any) => {
        // If item has old format (phone: string), convert to new format (phones: string[])
        if (item.phone !== undefined && !item.phones) {
          return {
            name: item.name || '',
            phones: item.phone ? [item.phone] : [],
            emails: Array.isArray(item.emails) ? item.emails : undefined
          };
        }
        // If item already has phones array, ensure it's valid
        return {
          name: item.name || '',
          phones: Array.isArray(item.phones) ? item.phones : [],
          emails: Array.isArray(item.emails) ? item.emails : undefined
        };
      });
    }
    
    // If it's a string, try to parse it
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          return this.transformContactPersons(parsed);
        }
        return [];
      } catch {
        return [];
      }
    }
    
    return [];
  }

  /**
   * Transform broker data from database to include parsed contact_persons
   */
  private transformBroker(broker: any): Broker {
    return {
      ...broker,
      contact_persons: this.transformContactPersons(broker.contact_persons || broker.contact_person),
      bank_details_verified_at: broker.bank_details_verified_at ?? null,
      bank_details_verified_by: broker.bank_details_verified_by ?? null,
      bank_verification_error: broker.bank_verification_error ?? null,
      kyc_verification_details: parseEntityKycDetails(broker.kyc_verification_details),
    };
  }

  /**
   * @param bankVerified - true: only brokers with confirmed bank; false: only never confirmed; undefined: all
   */
  async findAll(includeInactive = false, type?: BrokerType, bankVerified?: boolean): Promise<Broker[]> {
    let query = `
      SELECT ${BROKER_SELECT_COLUMNS}
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

    if (bankVerified === true) {
      query += ` AND bank_details_verified_at IS NOT NULL`;
    } else if (bankVerified === false) {
      query += ` AND bank_details_verified_at IS NULL`;
    }

    query += ` ORDER BY business_name ASC`;

    const result = await db.query<any>(query, params);
    return result.rows.map(row => this.transformBroker(row));
  }

  async findById(id: string): Promise<Broker | null> {
    const query = `
      SELECT ${BROKER_SELECT_COLUMNS}
      FROM brokers
      WHERE id = $1
    `;
    const result = await db.query<any>(query, [id]);
    return result.rows[0] ? this.transformBroker(result.rows[0]) : null;
  }

  async findByEmail(email: string): Promise<Broker | null> {
    const query = `
      SELECT ${BROKER_SELECT_COLUMNS}
      FROM brokers
      WHERE email = $1
    `;
    const result = await db.query<any>(query, [email]);
    return result.rows[0] ? this.transformBroker(result.rows[0]) : null;
  }

  async findByAadhaar(aadhaarNumber: string): Promise<Broker | null> {
    // Remove spaces from Aadhaar number for comparison
    const cleanedAadhaar = aadhaarNumber.replace(/\s/g, '');
    const query = `
      SELECT ${BROKER_SELECT_COLUMNS}
      FROM brokers
      WHERE REPLACE(business_details->>'aadhaar_number', ' ', '') = $1
    `;
    const result = await db.query<any>(query, [cleanedAadhaar]);
    return result.rows[0] ? this.transformBroker(result.rows[0]) : null;
  }

  async findByPAN(panNumber: string): Promise<Broker | null> {
    const query = `
      SELECT ${BROKER_SELECT_COLUMNS}
      FROM brokers
      WHERE business_details->>'pan_number' = $1
    `;
    const result = await db.query<any>(query, [panNumber]);
    return result.rows[0] ? this.transformBroker(result.rows[0]) : null;
  }

  async create(brokerData: CreateBrokerDTO & { user_id?: string }): Promise<Broker> {
    // Extract first contact person data for legacy fields
    const firstContactPerson = brokerData.contact_persons[0];
    const primaryEmail = firstContactPerson.emails?.[0]?.trim() || null;
    const primaryPhone = firstContactPerson.phones[0];

    const kycDetails = mergeEntityKycDetailsPatch({}, brokerData.kyc_verification_details);

    const query = `
      INSERT INTO brokers (business_name, contact_persons, email, phone, address, business_details, 
                          bank_details, broker_details, type, is_active, created_by, user_id, kyc_verification_details)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING ${BROKER_SELECT_COLUMNS}
    `;
    
    const values = [
      brokerData.business_name || null,
      JSON.stringify(brokerData.contact_persons),
      primaryEmail,
      primaryPhone,
      JSON.stringify(brokerData.address),
      JSON.stringify(brokerData.business_details),
      brokerData.bank_details ? JSON.stringify(brokerData.bank_details) : null,
      brokerData.broker_details ? JSON.stringify(brokerData.broker_details) : null,
      brokerData.type,
      brokerData.is_active !== undefined ? brokerData.is_active : true,
      brokerData.created_by || null,
      brokerData.user_id || null,
      JSON.stringify(kycDetails),
    ];

    const result = await db.query<any>(query, values);
    const broker = this.transformBroker(result.rows[0]);

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

    if (brokerData.contact_persons !== undefined) {
      updateFields.push(`contact_persons = $${paramCount++}`);
      values.push(JSON.stringify(brokerData.contact_persons));
      
      // Also update legacy fields from first contact person
      const firstContactPerson = brokerData.contact_persons[0];
      if (firstContactPerson) {
        updateFields.push(`phone = $${paramCount++}`);
        values.push(firstContactPerson.phones[0]);
        updateFields.push(`email = $${paramCount++}`);
        values.push(firstContactPerson.emails?.[0]?.trim() || null);
      }
    }

    if (brokerData.address !== undefined) {
      updateFields.push(`address = $${paramCount++}`);
      values.push(JSON.stringify(brokerData.address));
    }

    if (brokerData.business_details !== undefined) {
      updateFields.push(`business_details = $${paramCount++}`);
      values.push(JSON.stringify(brokerData.business_details));
    }

    if (brokerData.bank_details !== undefined) {
      updateFields.push(`bank_details = $${paramCount++}`);
      values.push(brokerData.bank_details ? JSON.stringify(brokerData.bank_details) : null);
      updateFields.push(`bank_details_verified_at = NULL`);
      updateFields.push(`bank_details_verified_by = NULL`);
      updateFields.push(`bank_verification_error = NULL`);
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

    if (brokerData.kyc_verification_details !== undefined) {
      const existingRow = await db.query<{ kyc_verification_details: unknown }>(
        `SELECT kyc_verification_details FROM brokers WHERE id = $1`,
        [id]
      );
      const merged = mergeEntityKycDetailsPatch(
        parseEntityKycDetails(existingRow.rows[0]?.kyc_verification_details),
        brokerData.kyc_verification_details
      );
      updateFields.push(`kyc_verification_details = $${paramCount++}::jsonb`);
      values.push(JSON.stringify(merged));
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
      RETURNING ${BROKER_SELECT_COLUMNS}
    `;

    const result = await db.query<any>(query, values);
    const broker = result.rows[0] ? this.transformBroker(result.rows[0]) : null;

    if (broker) {
      logger.info('Broker updated', {
        brokerId: broker.id,
        business_name: broker.business_name
      });
    }

    return broker;
  }

  /** Call after Surepass confirms the broker's stored account + IFSC. */
  async markBankDetailsVerified(id: string, verifiedByUserId: string): Promise<Broker | null> {
    const query = `
      UPDATE brokers
      SET bank_details_verified_at = CURRENT_TIMESTAMP,
          bank_details_verified_by = $2,
          bank_verification_error = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING ${BROKER_SELECT_COLUMNS}
    `;
    const result = await db.query<Broker>(query, [id, verifiedByUserId]);
    const row = result.rows[0];
    if (row) {
      logger.info('Broker bank details marked verified', { brokerId: id });
    }
    return row ? this.transformBroker(row) : null;
  }

  /** Persist last bank verification failure (lenient create / future retries). Pass null to clear. */
  async setBankVerificationError(id: string, message: string | null): Promise<Broker | null> {
    const query = `
      UPDATE brokers
      SET bank_verification_error = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING ${BROKER_SELECT_COLUMNS}
    `;
    const result = await db.query<Broker>(query, [id, message]);
    const row = result.rows[0];
    return row ? this.transformBroker(row) : null;
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

  async aadhaarExists(aadhaarNumber: string, excludeId?: string): Promise<boolean> {
    // Remove spaces from Aadhaar number for comparison
    const cleanedAadhaar = aadhaarNumber.replace(/\s/g, '');
    const query = excludeId 
      ? `SELECT 1 FROM brokers WHERE REPLACE(business_details->>'aadhaar_number', ' ', '') = $1 AND id != $2 LIMIT 1`
      : `SELECT 1 FROM brokers WHERE REPLACE(business_details->>'aadhaar_number', ' ', '') = $1 LIMIT 1`;
    
    const values = excludeId ? [cleanedAadhaar, excludeId] : [cleanedAadhaar];
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

  async gstExists(gstNumber: string, excludeId?: string): Promise<boolean> {
    const query = excludeId 
      ? `SELECT 1 FROM brokers WHERE business_details->>'gst_number' = $1 AND id != $2 LIMIT 1`
      : `SELECT 1 FROM brokers WHERE business_details->>'gst_number' = $1 LIMIT 1`;
    const values = excludeId ? [gstNumber, excludeId] : [gstNumber];
    const result = await db.query(query, values);
    return result.rows.length > 0;
  }
}

export const brokerDAO = new BrokerDAO();
