import { db } from '../database/connection';
import type { Godown, CreateGodownDTO, UpdateGodownDTO } from '../models/godown.model';
import type { ContactPerson } from '../models/vendor.model';
import { logger } from '../utils/logger';

const COLUMNS =
  'id, name, gst_number, address, google_maps_link, contact_persons, sales_party_id, is_active, created_at, updated_at, created_by, updated_by';

export class GodownDAO {
  private transformContactPersons(data: unknown): ContactPerson[] {
    if (!data) return [];
    if (Array.isArray(data)) {
      return data.map((item: any) => {
        if (item?.phone !== undefined && !item.phones) {
          return {
            name: item.name || '',
            phones: item.phone ? [item.phone] : [],
            emails: Array.isArray(item.emails) ? item.emails : undefined,
          };
        }
        return {
          name: item.name || '',
          phones: Array.isArray(item.phones) ? item.phones : [],
          emails: Array.isArray(item.emails) ? item.emails : undefined,
        };
      });
    }
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        return this.transformContactPersons(parsed);
      } catch {
        return [];
      }
    }
    return [];
  }

  private mapRow(row: Godown): Godown {
    return {
      ...row,
      contact_persons: this.transformContactPersons((row as any).contact_persons),
    };
  }

  async findAll(includeInactive = false): Promise<Godown[]> {
    let query = `SELECT ${COLUMNS} FROM godowns WHERE 1=1`;
    const params: any[] = [];
    if (!includeInactive) query += ' AND is_active = true';
    query += ' ORDER BY name ASC';
    const result = await db.query<Godown>(query, params);
    return result.rows.map((r) => this.mapRow(r));
  }

  async findById(id: string): Promise<Godown | null> {
    const result = await db.query<Godown>(`SELECT ${COLUMNS} FROM godowns WHERE id = $1`, [id]);
    const row = result.rows[0];
    return row ? this.mapRow(row) : null;
  }

  async create(data: CreateGodownDTO): Promise<Godown> {
    const query = `
      INSERT INTO godowns (name, gst_number, address, google_maps_link, contact_persons, is_active, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING ${COLUMNS}
    `;
    const values = [
      data.name,
      data.gst_number ?? null,
      JSON.stringify(data.address),
      data.google_maps_link ?? null,
      JSON.stringify(data.contact_persons),
      data.is_active ?? true,
      data.created_by ?? null,
    ];
    const result = await db.query<Godown>(query, values);
    logger.info('Godown created', { id: result.rows[0].id });
    return this.mapRow(result.rows[0]);
  }

  async update(id: string, data: UpdateGodownDTO): Promise<Godown | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let n = 1;
    if (data.name !== undefined) {
      fields.push(`name = $${n++}`);
      values.push(data.name);
    }
    if (data.gst_number !== undefined) {
      fields.push(`gst_number = $${n++}`);
      values.push(data.gst_number ?? null);
    }
    if (data.address !== undefined) {
      fields.push(`address = $${n++}`);
      values.push(JSON.stringify(data.address));
    }
    if (data.google_maps_link !== undefined) {
      fields.push(`google_maps_link = $${n++}`);
      values.push(data.google_maps_link ?? null);
    }
    if (data.contact_persons !== undefined) {
      fields.push(`contact_persons = $${n++}`);
      values.push(JSON.stringify(data.contact_persons));
    }
    if (data.sales_party_id !== undefined) {
      fields.push(`sales_party_id = $${n++}`);
      values.push(data.sales_party_id ?? null);
    }
    if (data.is_active !== undefined) {
      fields.push(`is_active = $${n++}`);
      values.push(data.is_active);
    }
    if (data.updated_by !== undefined) {
      fields.push(`updated_by = $${n++}`);
      values.push(data.updated_by);
    }
    if (fields.length === 0) return this.findById(id);

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    const query = `UPDATE godowns SET ${fields.join(', ')} WHERE id = $${n} RETURNING ${COLUMNS}`;
    const result = await db.query<Godown>(query, values);
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.query('DELETE FROM godowns WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }
}

export const godownDAO = new GodownDAO();
