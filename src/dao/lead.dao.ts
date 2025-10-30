import { db } from '../database/connection';
import { Lead, CreateLeadDTO, UpdateLeadDTO, LeadStatus, Priority } from '../models/lead.model';
import { logger } from '../utils/logger';

export class LeadDAO {
  async findAll(
    _includeInactive = false,
    leadStatus?: LeadStatus,
    assignedTo?: string,
    priority?: Priority,
    isExistingCustomer?: boolean
  ): Promise<Lead[]> {
    let query = `
      SELECT id, company_name, contact_person, email, phone, address, business_details,
             is_existing_customer, lead_status, customer_status, assigned_to, rice_code_id,
             rice_type, created_by, updated_by, created_at, updated_at, notes, priority,
             source, estimated_value, expected_close_date, revenue
      FROM leads
      WHERE 1=1
    `;
    
    const params: any[] = [];
    let paramCount = 1;

    if (leadStatus) {
      query += ` AND lead_status = $${paramCount++}`;
      params.push(leadStatus);
    }

    if (assignedTo) {
      query += ` AND assigned_to = $${paramCount++}`;
      params.push(assignedTo);
    }

    if (priority) {
      query += ` AND priority = $${paramCount++}`;
      params.push(priority);
    }

    if (isExistingCustomer !== undefined) {
      query += ` AND is_existing_customer = $${paramCount++}`;
      params.push(isExistingCustomer);
    }

    query += ` ORDER BY created_at DESC`;

    const result = await db.query<Lead>(query, params);
    return result.rows;
  }

  async findById(id: string): Promise<Lead | null> {
    const query = `
      SELECT id, company_name, contact_person, email, phone, address, business_details,
             is_existing_customer, lead_status, customer_status, assigned_to, rice_code_id,
             rice_type, created_by, updated_by, created_at, updated_at, notes, priority,
             source, estimated_value, expected_close_date, revenue
      FROM leads
      WHERE id = $1
    `;
    const result = await db.query<Lead>(query, [id]);
    return result.rows[0] || null;
  }

  async findByEmail(email: string): Promise<Lead | null> {
    const query = `
      SELECT id, company_name, contact_person, email, phone, address, business_details,
             is_existing_customer, lead_status, customer_status, assigned_to, rice_code_id,
             rice_type, created_by, updated_by, created_at, updated_at, notes, priority,
             source, estimated_value, expected_close_date, revenue
      FROM leads
      WHERE email = $1
    `;
    const result = await db.query<Lead>(query, [email]);
    return result.rows[0] || null;
  }

  async findByAssignedTo(assignedTo: string): Promise<Lead[]> {
    const query = `
      SELECT id, company_name, contact_person, email, phone, address, business_details,
             is_existing_customer, lead_status, customer_status, assigned_to, rice_code_id,
             rice_type, created_by, updated_by, created_at, updated_at, notes, priority,
             source, estimated_value, expected_close_date, revenue
      FROM leads
      WHERE assigned_to = $1
      ORDER BY priority DESC, created_at DESC
    `;
    const result = await db.query<Lead>(query, [assignedTo]);
    return result.rows;
  }

  async create(leadData: CreateLeadDTO): Promise<Lead> {
    const query = `
      INSERT INTO leads (company_name, contact_person, email, phone, address, business_details,
                        is_existing_customer, lead_status, customer_status, assigned_to, rice_code_id,
                        rice_type, created_by, notes, priority, source, estimated_value,
                        expected_close_date, revenue)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING id, company_name, contact_person, email, phone, address, business_details,
                is_existing_customer, lead_status, customer_status, assigned_to, rice_code_id,
                rice_type, created_by, updated_by, created_at, updated_at, notes, priority,
                source, estimated_value, expected_close_date, revenue
    `;
    
    const values = [
      leadData.company_name,
      leadData.contact_person,
      leadData.email,
      leadData.phone || null,
      leadData.address ? JSON.stringify(leadData.address) : null,
      leadData.business_details ? JSON.stringify(leadData.business_details) : null,
      leadData.is_existing_customer !== undefined ? leadData.is_existing_customer : false,
      leadData.lead_status || 'new',
      leadData.customer_status || null,
      leadData.assigned_to || null,
      leadData.rice_code_id,
      leadData.rice_type,
      leadData.created_by || null,
      leadData.notes || null,
      leadData.priority || 'medium',
      leadData.source || null,
      leadData.estimated_value || null,
      leadData.expected_close_date || null,
      leadData.revenue || null
    ];

    const result = await db.query<Lead>(query, values);
    const lead = result.rows[0];

    logger.info('Lead created', {
      leadId: lead.id,
      companyName: lead.company_name,
      contactPerson: lead.contact_person,
      email: lead.email
    });

    return lead;
  }

  async update(id: string, leadData: UpdateLeadDTO): Promise<Lead | null> {
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (leadData.company_name !== undefined) {
      fields.push(`company_name = $${paramCount++}`);
      values.push(leadData.company_name);
    }
    if (leadData.contact_person !== undefined) {
      fields.push(`contact_person = $${paramCount++}`);
      values.push(leadData.contact_person);
    }
    if (leadData.email !== undefined) {
      fields.push(`email = $${paramCount++}`);
      values.push(leadData.email);
    }
    if (leadData.phone !== undefined) {
      fields.push(`phone = $${paramCount++}`);
      values.push(leadData.phone);
    }
    if (leadData.address !== undefined) {
      fields.push(`address = $${paramCount++}`);
      values.push(leadData.address ? JSON.stringify(leadData.address) : null);
    }
    if (leadData.business_details !== undefined) {
      fields.push(`business_details = $${paramCount++}`);
      values.push(leadData.business_details ? JSON.stringify(leadData.business_details) : null);
    }
    if (leadData.is_existing_customer !== undefined) {
      fields.push(`is_existing_customer = $${paramCount++}`);
      values.push(leadData.is_existing_customer);
    }
    if (leadData.lead_status !== undefined) {
      fields.push(`lead_status = $${paramCount++}`);
      values.push(leadData.lead_status);
    }
    if (leadData.customer_status !== undefined) {
      fields.push(`customer_status = $${paramCount++}`);
      values.push(leadData.customer_status);
    }
    if (leadData.assigned_to !== undefined) {
      fields.push(`assigned_to = $${paramCount++}`);
      values.push(leadData.assigned_to);
    }
    if (leadData.rice_code_id !== undefined) {
      fields.push(`rice_code_id = $${paramCount++}`);
      values.push(leadData.rice_code_id);
    }
    if (leadData.rice_type !== undefined) {
      fields.push(`rice_type = $${paramCount++}`);
      values.push(leadData.rice_type);
    }
    if (leadData.updated_by !== undefined) {
      fields.push(`updated_by = $${paramCount++}`);
      values.push(leadData.updated_by);
    }
    if (leadData.notes !== undefined) {
      fields.push(`notes = $${paramCount++}`);
      values.push(leadData.notes);
    }
    if (leadData.priority !== undefined) {
      fields.push(`priority = $${paramCount++}`);
      values.push(leadData.priority);
    }
    if (leadData.source !== undefined) {
      fields.push(`source = $${paramCount++}`);
      values.push(leadData.source);
    }
    if (leadData.estimated_value !== undefined) {
      fields.push(`estimated_value = $${paramCount++}`);
      values.push(leadData.estimated_value);
    }
    if (leadData.expected_close_date !== undefined) {
      fields.push(`expected_close_date = $${paramCount++}`);
      values.push(leadData.expected_close_date);
    }
    if (leadData.revenue !== undefined) {
      fields.push(`revenue = $${paramCount++}`);
      values.push(leadData.revenue);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE leads
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, company_name, contact_person, email, phone, address, business_details,
                is_existing_customer, lead_status, customer_status, assigned_to, rice_code_id,
                rice_type, created_by, updated_by, created_at, updated_at, notes, priority,
                source, estimated_value, expected_close_date, revenue
    `;

    const result = await db.query<Lead>(query, values);
    return result.rows[0] || null;
  }

  async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM leads WHERE id = $1';
    const result = await db.query(query, [id]);
    return (result.rowCount || 0) > 0;
  }

  async emailExists(email: string, excludeId?: string): Promise<boolean> {
    let query = 'SELECT 1 FROM leads WHERE email = $1';
    const params = [email];
    
    if (excludeId) {
      query += ' AND id != $2';
      params.push(excludeId);
    }
    
    const result = await db.query(query, params);
    return result.rows.length > 0;
  }

  async getAnalytics(): Promise<any[]> {
    const query = 'SELECT * FROM lead_analytics ORDER BY created_at DESC';
    const result = await db.query(query);
    return result.rows;
  }

  async getLeadStats(): Promise<any> {
    const query = `
      SELECT 
        COUNT(*) as total_leads,
        COUNT(CASE WHEN lead_status = 'new' THEN 1 END) as new_leads,
        COUNT(CASE WHEN lead_status = 'contacted' THEN 1 END) as contacted_leads,
        COUNT(CASE WHEN lead_status = 'engaged' THEN 1 END) as engaged_leads,
        COUNT(CASE WHEN lead_status = 'converted' THEN 1 END) as converted_leads,
        COUNT(CASE WHEN lead_status = 'rejected' THEN 1 END) as rejected_leads,
        COUNT(CASE WHEN priority = 'high' THEN 1 END) as high_priority_leads,
        COUNT(CASE WHEN priority = 'urgent' THEN 1 END) as urgent_leads,
        AVG(estimated_value) as avg_estimated_value,
        SUM(estimated_value) as total_estimated_value
      FROM leads
    `;
    const result = await db.query(query);
    return result.rows[0];
  }
}
