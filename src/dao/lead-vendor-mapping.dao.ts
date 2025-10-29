import { db } from '../database/connection';
import { LeadVendorMapping, CreateLeadVendorMappingDTO } from '../models/lead-vendor-mapping.model';
import { logger } from '../utils/logger';

export class LeadVendorMappingDAO {
  async findByVendorId(vendorId: string): Promise<LeadVendorMapping[]> {
    const query = `
      SELECT id, lead_id, vendor_id, converted_at, conversion_value, created_by
      FROM lead_vendor_mapping
      WHERE vendor_id = $1
      ORDER BY converted_at DESC
    `;
    const result = await db.query<LeadVendorMapping>(query, [vendorId]);
    return result.rows;
  }

  async findByLeadId(leadId: string): Promise<LeadVendorMapping[]> {
    const query = `
      SELECT id, lead_id, vendor_id, converted_at, conversion_value, created_by
      FROM lead_vendor_mapping
      WHERE lead_id = $1
      ORDER BY converted_at DESC
    `;
    const result = await db.query<LeadVendorMapping>(query, [leadId]);
    return result.rows;
  }

  async create(mappingData: CreateLeadVendorMappingDTO): Promise<LeadVendorMapping> {
    const query = `
      INSERT INTO lead_vendor_mapping (lead_id, vendor_id, conversion_value, created_by)
      VALUES ($1, $2, $3, $4)
      RETURNING id, lead_id, vendor_id, converted_at, conversion_value, created_by
    `;
    
    const values = [
      mappingData.lead_id,
      mappingData.vendor_id,
      mappingData.conversion_value || null,
      mappingData.created_by || null
    ];

    const result = await db.query<LeadVendorMapping>(query, values);
    const mapping = result.rows[0];

    logger.info('Lead-Vendor mapping created', {
      mappingId: mapping.id,
      leadId: mapping.lead_id,
      vendorId: mapping.vendor_id
    });

    return mapping;
  }

  async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM lead_vendor_mapping WHERE id = $1';
    const result = await db.query(query, [id]);
    return (result.rowCount || 0) > 0;
  }
}

export const leadVendorMappingDAO = new LeadVendorMappingDAO();
