import { db } from '../database/connection';
import { PackagingVendor, CreatePackagingVendorDTO, UpdatePackagingVendorDTO } from '../models/packaging-vendor.model';
import { ContactPerson, Address } from '../models/broker.model';
import { logger } from '../utils/logger';

export class PackagingVendorDAO {
  /**
   * Transform contact_persons from database (JSONB or string) to ContactPerson[]
   */
  private transformContactPersons(data: any): ContactPerson[] {
    if (!data) return [];
    
    if (Array.isArray(data)) {
      return data.map((item: any) => {
        if (item.phone !== undefined && !item.phones) {
          return {
            name: item.name || '',
            phones: item.phone ? [item.phone] : [],
            emails: Array.isArray(item.emails) ? item.emails : undefined
          };
        }
        return {
          name: item.name || '',
          phones: Array.isArray(item.phones) ? item.phones : [],
          emails: Array.isArray(item.emails) ? item.emails : undefined
        };
      });
    }
    
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
   * Transform address from database (JSONB or string) to Address
   */
  private transformAddress(data: any): Address {
    if (!data) {
      return {
        street: '',
        city: '',
        state: '',
        pincode: '',
        country: ''
      };
    }
    
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        return {
          street: parsed.street || '',
          city: parsed.city || '',
          state: parsed.state || '',
          pincode: parsed.pincode || '',
          country: parsed.country || ''
        };
      } catch {
        return {
          street: '',
          city: '',
          state: '',
          pincode: '',
          country: ''
        };
      }
    }
    
    return {
      street: data.street || '',
      city: data.city || '',
      state: data.state || '',
      pincode: data.pincode || '',
      country: data.country || ''
    };
  }

  /**
   * Transform packaging vendor data from database
   */
  private transformVendor(vendor: any): PackagingVendor {
    return {
      ...vendor,
      contact_persons: this.transformContactPersons(vendor.contact_persons || vendor.contact_person),
      address: this.transformAddress(vendor.address)
    };
  }

  async findAll(): Promise<PackagingVendor[]> {
    const query = `
      SELECT id, name, contact_persons, address, gst_number, 
             created_at, updated_at, created_by, updated_by
      FROM packaging_vendors
      ORDER BY name ASC
    `;
    const result = await db.query<any>(query);
    return result.rows.map(row => this.transformVendor(row));
  }

  async findById(id: string): Promise<PackagingVendor | null> {
    const query = `
      SELECT id, name, contact_persons, address, gst_number,
             created_at, updated_at, created_by, updated_by
      FROM packaging_vendors
      WHERE id = $1
    `;
    const result = await db.query<any>(query, [id]);
    return result.rows[0] ? this.transformVendor(result.rows[0]) : null;
  }

  async create(vendorData: CreatePackagingVendorDTO): Promise<PackagingVendor> {
    const query = `
      INSERT INTO packaging_vendors (name, contact_persons, address, gst_number, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, name, contact_persons, address, gst_number,
                created_at, updated_at, created_by, updated_by
    `;
    
    const values = [
      vendorData.name,
      JSON.stringify(vendorData.contact_persons),
      JSON.stringify(vendorData.address),
      vendorData.gst_number || null,
      vendorData.created_by || null
    ];

    try {
      const result = await db.query<any>(query, values);
      logger.info('Packaging vendor created', { id: result.rows[0].id, name: result.rows[0].name });
      return this.transformVendor(result.rows[0]);
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
    if (vendorData.contact_persons !== undefined) {
      fields.push(`contact_persons = $${paramCount++}`);
      values.push(JSON.stringify(vendorData.contact_persons));
    }
    if (vendorData.address !== undefined) {
      fields.push(`address = $${paramCount++}`);
      values.push(JSON.stringify(vendorData.address));
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
      RETURNING id, name, contact_persons, address, gst_number,
                created_at, updated_at, created_by, updated_by
    `;

    try {
      const result = await db.query<any>(query, values);
      if (result.rows.length === 0) {
        return null;
      }
      logger.info('Packaging vendor updated', { id });
      return this.transformVendor(result.rows[0]);
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

