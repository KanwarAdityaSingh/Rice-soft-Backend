import { db } from '../database/connection';
import {
  VendorSite,
  CreateVendorSiteDTO,
  UpdateVendorSiteDTO,
} from '../models/vendor-site.model';
import { logger } from '../utils/logger';

const SELECT_COLUMNS = `
  id, vendor_id, name, address, google_location_link, is_active,
  created_at, updated_at, created_by, updated_by
`;

export class VendorSiteDAO {
  async findByVendorId(vendorId: string, includeInactive = false): Promise<VendorSite[]> {
    let query = `
      SELECT ${SELECT_COLUMNS}
      FROM vendor_sites
      WHERE vendor_id = $1
    `;
    const params: unknown[] = [vendorId];
    if (!includeInactive) {
      query += ` AND is_active = true`;
    }
    query += ` ORDER BY name NULLS LAST, created_at ASC`;
    const result = await db.query<VendorSite>(query, params);
    return result.rows;
  }

  async findById(id: string): Promise<VendorSite | null> {
    const query = `
      SELECT ${SELECT_COLUMNS}
      FROM vendor_sites
      WHERE id = $1
    `;
    const result = await db.query<VendorSite>(query, [id]);
    return result.rows[0] || null;
  }

  async create(data: CreateVendorSiteDTO): Promise<VendorSite> {
    const query = `
      INSERT INTO vendor_sites (
        vendor_id, name, address, google_location_link, is_active, created_by
      )
      VALUES ($1, $2, $3::jsonb, $4, $5, $6)
      RETURNING ${SELECT_COLUMNS}
    `;
    const values = [
      data.vendor_id,
      data.name?.trim() || null,
      JSON.stringify(data.address),
      data.google_location_link?.trim() || null,
      data.is_active !== undefined ? data.is_active : true,
      data.created_by || null,
    ];
    const result = await db.query<VendorSite>(query, values);
    const row = result.rows[0];
    logger.info('Vendor site created', { id: row.id, vendor_id: row.vendor_id });
    return row;
  }

  async update(id: string, data: UpdateVendorSiteDTO): Promise<VendorSite | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${paramCount++}`);
      values.push(data.name?.trim() || null);
    }
    if (data.address !== undefined) {
      fields.push(`address = $${paramCount++}::jsonb`);
      values.push(JSON.stringify(data.address));
    }
    if (data.google_location_link !== undefined) {
      fields.push(`google_location_link = $${paramCount++}`);
      values.push(data.google_location_link?.trim() || null);
    }
    if (data.is_active !== undefined) {
      fields.push(`is_active = $${paramCount++}`);
      values.push(data.is_active);
    }
    if (data.updated_by !== undefined) {
      fields.push(`updated_by = $${paramCount++}`);
      values.push(data.updated_by);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE vendor_sites
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING ${SELECT_COLUMNS}
    `;

    const result = await db.query<VendorSite>(query, values);
    const row = result.rows[0] || null;
    if (row) {
      logger.info('Vendor site updated', { id: row.id });
    }
    return row;
  }

  async delete(id: string): Promise<boolean> {
    const query = `DELETE FROM vendor_sites WHERE id = $1`;
    const result = await db.query(query, [id]);
    const ok = (result.rowCount || 0) > 0;
    if (ok) {
      logger.info('Vendor site deleted', { id });
    }
    return ok;
  }
}

export const vendorSiteDAO = new VendorSiteDAO();
