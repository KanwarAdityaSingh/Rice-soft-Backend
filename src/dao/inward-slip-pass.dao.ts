import { db } from '../database/connection';
import { InwardSlipPass, CreateInwardSlipPassDTO, UpdateInwardSlipPassDTO } from '../models/inward-slip-pass.model';
import { logger } from '../utils/logger';

export class InwardSlipPassDAO {
  async findAll(saudaId?: string, godownId?: string): Promise<InwardSlipPass[]> {
    let query = `
      SELECT isp.id, isp.godown_id, isp.slip_number, isp.date, isp.vehicle_id, isp.party_name, isp.party_address,
             isp.party_gst_number, isp.party_pan_number, isp.transporter_id, isp.transportation_cost, isp.status, 
             isp.other_bills,
             isp.bill_pdf_url, isp.bill_number, isp.bill_date, isp.bilti_image_url, isp.bilti_pdf_url, isp.eway_bill_number, isp.eway_bill_url,
             isp.notes, isp.created_at, isp.updated_at, isp.created_by, isp.updated_by
      FROM inward_slip_passes isp
      WHERE 1=1
    `;
    
    const params: any[] = [];
    let paramCount = 1;

    if (saudaId) {
      query += ` AND isp.id IN (
        SELECT inward_slip_pass_id 
        FROM inward_slip_pass_saudas 
        WHERE sauda_id = $${paramCount++}
      )`;
      params.push(saudaId);
    }
    if (godownId) {
      query += ` AND isp.godown_id = $${paramCount++}`;
      params.push(godownId);
    }

    query += ` ORDER BY isp.date DESC, isp.created_at DESC`;

    const result = await db.query<any>(query, params);
    // Parse JSONB other_bills to array
    return result.rows.map(row => ({
      ...row,
      other_bills: row.other_bills ? JSON.parse(JSON.stringify(row.other_bills)) : []
    }));
  }

  async findById(id: string): Promise<InwardSlipPass | null> {
    const query = `
      SELECT isp.id, isp.godown_id, isp.slip_number, isp.date, isp.vehicle_id, isp.party_name, isp.party_address,
             isp.party_gst_number, isp.party_pan_number, isp.transporter_id, isp.transportation_cost, isp.status, 
             isp.other_bills,
             isp.bill_pdf_url, isp.bill_number, isp.bill_date, isp.bilti_image_url, isp.bilti_pdf_url, isp.eway_bill_number, isp.eway_bill_url,
             isp.notes, isp.created_at, isp.updated_at, isp.created_by, isp.updated_by
      FROM inward_slip_passes isp
      WHERE isp.id = $1
    `;
    const result = await db.query<any>(query, [id]);
    if (result.rows.length === 0) {
      return null;
    }
    const row = result.rows[0];
    // Parse JSONB other_bills to array
    return {
      ...row,
      other_bills: row.other_bills ? JSON.parse(JSON.stringify(row.other_bills)) : []
    };
  }

  async create(inwardSlipPassData: CreateInwardSlipPassDTO): Promise<InwardSlipPass> {
    const insertQuery = `
      INSERT INTO inward_slip_passes (godown_id, slip_number, date, vehicle_id, party_name,
                                      party_address, party_gst_number, party_pan_number, transporter_id, transportation_cost, status, other_bills,
                                      bill_pdf_url, bill_number, bill_date, bilti_image_url,
                                      bilti_pdf_url, eway_bill_number, eway_bill_url, notes, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      RETURNING id
    `;
    
    const values = [
      inwardSlipPassData.godown_id,
      inwardSlipPassData.slip_number || null, // null will trigger auto-generation
      inwardSlipPassData.date,
      inwardSlipPassData.vehicle_id,
      inwardSlipPassData.party_name,
      inwardSlipPassData.party_address || null,
      inwardSlipPassData.party_gst_number || null,
      inwardSlipPassData.party_pan_number || null,
      inwardSlipPassData.transporter_id || null,
      inwardSlipPassData.transportation_cost || null,
      inwardSlipPassData.status || 'pending',
      JSON.stringify(inwardSlipPassData.other_bills || []),
      inwardSlipPassData.bill_pdf_url || null,
      inwardSlipPassData.bill_number || null,
      inwardSlipPassData.bill_date || null,
      inwardSlipPassData.bilti_image_url || null,
      inwardSlipPassData.bilti_pdf_url || null,
      inwardSlipPassData.eway_bill_number || null,
      inwardSlipPassData.eway_bill_url || null,
      inwardSlipPassData.notes || null,
      inwardSlipPassData.created_by || null,
    ];

    try {
      const result = await db.query<{ id: string }>(insertQuery, values);
      const createdId = result.rows[0].id;
      logger.info('Inward slip pass created', { id: createdId });
      
      // Fetch the complete record with vehicle_number joined
      const createdISP = await this.findById(createdId);
      if (!createdISP) {
        throw new Error('Failed to retrieve created inward slip pass');
      }
      
      return createdISP;
    } catch (error) {
      logger.error('Error creating inward slip pass', { error, inwardSlipPassData });
      throw error;
    }
  }

  async update(id: string, inwardSlipPassData: UpdateInwardSlipPassDTO): Promise<InwardSlipPass | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (inwardSlipPassData.godown_id !== undefined) {
      fields.push(`godown_id = $${paramCount++}`);
      values.push(inwardSlipPassData.godown_id);
    }
    if (inwardSlipPassData.slip_number !== undefined) {
      fields.push(`slip_number = $${paramCount++}`);
      values.push(inwardSlipPassData.slip_number);
    }
    if (inwardSlipPassData.date !== undefined) {
      fields.push(`date = $${paramCount++}`);
      values.push(inwardSlipPassData.date);
    }
    if (inwardSlipPassData.vehicle_id !== undefined) {
      fields.push(`vehicle_id = $${paramCount++}`);
      values.push(inwardSlipPassData.vehicle_id);
    }
    if (inwardSlipPassData.party_name !== undefined) {
      fields.push(`party_name = $${paramCount++}`);
      values.push(inwardSlipPassData.party_name);
    }
    if (inwardSlipPassData.party_address !== undefined) {
      fields.push(`party_address = $${paramCount++}`);
      values.push(inwardSlipPassData.party_address || null);
    }
    if (inwardSlipPassData.party_gst_number !== undefined) {
      fields.push(`party_gst_number = $${paramCount++}`);
      values.push(inwardSlipPassData.party_gst_number || null);
    }
    if (inwardSlipPassData.party_pan_number !== undefined) {
      fields.push(`party_pan_number = $${paramCount++}`);
      values.push(inwardSlipPassData.party_pan_number || null);
    }
    if (inwardSlipPassData.transporter_id !== undefined) {
      fields.push(`transporter_id = $${paramCount++}`);
      values.push(inwardSlipPassData.transporter_id || null);
    }
    if (inwardSlipPassData.transportation_cost !== undefined) {
      fields.push(`transportation_cost = $${paramCount++}`);
      values.push(inwardSlipPassData.transportation_cost || null);
    }
    if (inwardSlipPassData.status !== undefined) {
      fields.push(`status = $${paramCount++}`);
      values.push(inwardSlipPassData.status);
    }
    if (inwardSlipPassData.other_bills !== undefined) {
      fields.push(`other_bills = $${paramCount++}::jsonb`);
      values.push(JSON.stringify(inwardSlipPassData.other_bills || []));
    }
    if (inwardSlipPassData.bill_pdf_url !== undefined) {
      fields.push(`bill_pdf_url = $${paramCount++}`);
      values.push(inwardSlipPassData.bill_pdf_url || null);
    }
    if (inwardSlipPassData.bill_number !== undefined) {
      fields.push(`bill_number = $${paramCount++}`);
      values.push(inwardSlipPassData.bill_number || null);
    }
    if (inwardSlipPassData.bill_date !== undefined) {
      fields.push(`bill_date = $${paramCount++}`);
      values.push(inwardSlipPassData.bill_date || null);
    }
    if (inwardSlipPassData.bilti_image_url !== undefined) {
      fields.push(`bilti_image_url = $${paramCount++}`);
      values.push(inwardSlipPassData.bilti_image_url || null);
    }
    if (inwardSlipPassData.bilti_pdf_url !== undefined) {
      fields.push(`bilti_pdf_url = $${paramCount++}`);
      values.push(inwardSlipPassData.bilti_pdf_url || null);
    }
    if (inwardSlipPassData.eway_bill_number !== undefined) {
      fields.push(`eway_bill_number = $${paramCount++}`);
      values.push(inwardSlipPassData.eway_bill_number || null);
    }
    if (inwardSlipPassData.eway_bill_url !== undefined) {
      fields.push(`eway_bill_url = $${paramCount++}`);
      values.push(inwardSlipPassData.eway_bill_url || null);
    }
    if (inwardSlipPassData.notes !== undefined) {
      fields.push(`notes = $${paramCount++}`);
      values.push(inwardSlipPassData.notes || null);
    }
    if (inwardSlipPassData.updated_by !== undefined) {
      fields.push(`updated_by = $${paramCount++}`);
      values.push(inwardSlipPassData.updated_by);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE inward_slip_passes
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id
    `;

    try {
      const result = await db.query<{ id: string }>(query, values);
      if (result.rows.length === 0) {
        return null;
      }
      logger.info('Inward slip pass updated', { id });
      
      // Fetch the complete record with vehicle_number joined
      return await this.findById(id);
    } catch (error) {
      logger.error('Error updating inward slip pass', { error, id });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    const query = `DELETE FROM inward_slip_passes WHERE id = $1`;
    const result = await db.query(query, [id]);
    const deleted = (result.rowCount || 0) > 0;
    
    if (deleted) {
      logger.info('Inward slip pass deleted', { id });
    }
    
    return deleted;
  }

}

export const inwardSlipPassDAO = new InwardSlipPassDAO();














