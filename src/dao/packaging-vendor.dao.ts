import { db } from '../database/connection';
import { PackagingVendor, CreatePackagingVendorDTO, UpdatePackagingVendorDTO } from '../models/packaging-vendor.model';
import { logger } from '../utils/logger';

export class PackagingVendorDAO {
  async findAll(): Promise<PackagingVendor[]> {
    const query = `
      SELECT id, name, contact_person, phone, email, address, gst_number, 
             created_at, updated_at, created_by, updated_by
      FROM packaging_vendors
      ORDER BY name ASC
    `;
    const result = await db.query<PackagingVendor>(query);
    return result.rows;
  }

  async findById(id: string): Promise<PackagingVendor | null> {
    const query = `
      SELECT id, name, contact_person, phone, email, address, gst_number,
             created_at, updated_at, created_by, updated_by
      FROM packaging_vendors
      WHERE id = $1
    `;
    const result = await db.query<PackagingVendor>(query, [id]);
    return result.rows[0] || null;
  }

  async create(vendorData: CreatePackagingVendorDTO): Promise<PackagingVendor> {
    const query = `
      INSERT INTO packaging_vendors (name, contact_person, phone, email, address, gst_number, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, name, contact_person, phone, email, address, gst_number,
                created_at, updated_at, created_by, updated_by
    `;
    
    const values = [
      vendorData.name,
      vendorData.contact_person || null,
      vendorData.phone || null,
      vendorData.email || null,
      vendorData.address || null,
      vendorData.gst_number || null,
      vendorData.created_by || null
    ];

    try {
      const result = await db.query<PackagingVendor>(query, values);
      logger.info('Packaging vendor created', { id: result.rows[0].id, name: result.rows[0].name });
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating packaging vendor', { error, vendorData });
      throw error;
    }
  }

  async update(id: string, vendorData: UpdatePackagingVendorDTO): Promise<PackagingVendor | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (vendorData.name !== undefined) {
      fields.push(`name = $${paramCount++}`);
      values.push(vendorData.name);
    }
    if (vendorData.contact_person !== undefined) {
      fields.push(`contact_person = $${paramCount++}`);
      values.push(vendorData.contact_person || null);
    }
    if (vendorData.phone !== undefined) {
      fields.push(`phone = $${paramCount++}`);
      values.push(vendorData.phone || null);
    }
    if (vendorData.email !== undefined) {
      fields.push(`email = $${paramCount++}`);
      values.push(vendorData.email || null);
    }
    if (vendorData.address !== undefined) {
      fields.push(`address = $${paramCount++}`);
      values.push(vendorData.address || null);
    }
    if (vendorData.gst_number !== undefined) {
      fields.push(`gst_number = $${paramCount++}`);
      values.push(vendorData.gst_number || null);
    }
    if (vendorData.updated_by !== undefined) {
      fields.push(`updated_by = $${paramCount++}`);
      values.push(vendorData.updated_by);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE packaging_vendors
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, name, contact_person, phone, email, address, gst_number,
                created_at, updated_at, created_by, updated_by
    `;

    try {
      const result = await db.query<PackagingVendor>(query, values);
      if (result.rows.length === 0) {
        return null;
      }
      logger.info('Packaging vendor updated', { id });
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating packaging vendor', { error, id });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM packaging_vendors WHERE id = $1';
    const result = await db.query(query, [id]);
    const deleted = (result.rowCount || 0) > 0;
    if (deleted) {
      logger.info('Packaging vendor deleted', { id });
    }
    return deleted;
  }
}

export const packagingVendorDAO = new PackagingVendorDAO();

