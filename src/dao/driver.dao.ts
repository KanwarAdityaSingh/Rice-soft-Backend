import { db } from '../database/connection';
import { Driver, CreateDriverDTO, UpdateDriverDTO } from '../models/driver.model';
import { logger } from '../utils/logger';
import { normalizeDrivingLicenseForStorage } from '../utils/driver-license';

const SELECT_COLUMNS = `
  id, license_number, phone, name, date_of_birth, license_expires_at, address,
  is_verified, verified_at, verification_details,
  is_active, created_at, updated_at, created_by, updated_by
`;

/** Accept ISO YYYY-MM-DD or DD-MM-YYYY (common on Indian DL text). */
function toPgDate(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const s = String(value).trim();
  if (!s) {
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10);
  }
  const dm = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
  if (dm) {
    const [, dd, mm, yyyy] = dm;
    return `${yyyy}-${mm}-${dd}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export class DriverDAO {
  async findAll(includeInactive = false): Promise<Driver[]> {
    const query = includeInactive
      ? `SELECT ${SELECT_COLUMNS} FROM drivers ORDER BY license_number ASC`
      : `SELECT ${SELECT_COLUMNS} FROM drivers WHERE is_active = true ORDER BY license_number ASC`;
    const result = await db.query<Driver>(query);
    return result.rows;
  }

  async findById(id: string): Promise<Driver | null> {
    const query = `
      SELECT ${SELECT_COLUMNS}
      FROM drivers
      WHERE id = $1
    `;
    const result = await db.query<Driver>(query, [id]);
    return result.rows[0] || null;
  }

  async findByLicenseNumber(licenseNumber: string): Promise<Driver | null> {
    const normalized = normalizeDrivingLicenseForStorage(licenseNumber);
    const query = `
      SELECT ${SELECT_COLUMNS}
      FROM drivers
      WHERE license_number = $1
    `;
    const result = await db.query<Driver>(query, [normalized]);
    return result.rows[0] || null;
  }

  async licenseNumberExists(licenseNumber: string, excludeId?: string): Promise<boolean> {
    const normalized = normalizeDrivingLicenseForStorage(licenseNumber);
    let query = `SELECT EXISTS(SELECT 1 FROM drivers WHERE license_number = $1`;
    const params: unknown[] = [normalized];
    if (excludeId) {
      query += ` AND id != $2`;
      params.push(excludeId);
    }
    query += `) AS exists`;
    const result = await db.query<{ exists: boolean }>(query, params);
    return result.rows[0].exists;
  }

  async create(data: CreateDriverDTO): Promise<Driver> {
    const license = normalizeDrivingLicenseForStorage(data.license_number);
    const query = `
      INSERT INTO drivers (
        license_number, phone, name, date_of_birth, license_expires_at, address,
        is_verified, verified_at, verification_details,
        is_active, created_by
      )
      VALUES (
        $1, $2, $3,
        $4::date, $5::date, $6,
        $7, $8, $9::jsonb,
        $10, $11
      )
      RETURNING ${SELECT_COLUMNS}
    `;
    const dob = toPgDate(data.date_of_birth ?? null);
    const exp = toPgDate(data.license_expires_at ?? null);
    const values = [
      license,
      data.phone.trim(),
      data.name?.trim() || null,
      dob,
      exp,
      data.address?.trim() || null,
      data.is_verified !== undefined ? data.is_verified : false,
      data.verified_at || null,
      data.verification_details != null ? JSON.stringify(data.verification_details) : null,
      data.is_active !== undefined ? data.is_active : true,
      data.created_by || null,
    ];
    const result = await db.query<Driver>(query, values);
    const row = result.rows[0];
    logger.info('Driver created', { id: row.id, license_number: row.license_number });
    return row;
  }

  async update(id: string, data: UpdateDriverDTO): Promise<Driver | null> {
    if (data.license_number !== undefined) {
      const exists = await this.licenseNumberExists(data.license_number, id);
      if (exists) {
        throw new Error('Driving license number already exists');
      }
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (data.license_number !== undefined) {
      fields.push(`license_number = $${paramCount++}`);
      values.push(normalizeDrivingLicenseForStorage(data.license_number));
    }
    if (data.phone !== undefined) {
      fields.push(`phone = $${paramCount++}`);
      values.push(data.phone.trim());
    }
    if (data.name !== undefined) {
      fields.push(`name = $${paramCount++}`);
      values.push(data.name?.trim() || null);
    }
    if (data.date_of_birth !== undefined) {
      fields.push(`date_of_birth = $${paramCount++}::date`);
      values.push(toPgDate(data.date_of_birth));
    }
    if (data.license_expires_at !== undefined) {
      fields.push(`license_expires_at = $${paramCount++}::date`);
      values.push(toPgDate(data.license_expires_at));
    }
    if (data.address !== undefined) {
      fields.push(`address = $${paramCount++}`);
      values.push(data.address?.trim() || null);
    }
    if (data.is_verified !== undefined) {
      fields.push(`is_verified = $${paramCount++}`);
      values.push(data.is_verified);
    }
    if (data.verified_at !== undefined) {
      fields.push(`verified_at = $${paramCount++}`);
      values.push(data.verified_at || null);
    }
    if (data.verification_details !== undefined) {
      fields.push(`verification_details = $${paramCount++}::jsonb`);
      values.push(
        data.verification_details != null ? JSON.stringify(data.verification_details) : null
      );
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
      UPDATE drivers
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING ${SELECT_COLUMNS}
    `;

    const result = await db.query<Driver>(query, values);
    const row = result.rows[0] || null;
    if (row) {
      logger.info('Driver updated', { id: row.id });
    }
    return row;
  }

  async softDelete(id: string): Promise<boolean> {
    const query = `
      UPDATE drivers
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;
    const result = await db.query(query, [id]);
    const ok = (result.rowCount || 0) > 0;
    if (ok) {
      logger.info('Driver soft deleted', { id });
    }
    return ok;
  }
}

export const driverDAO = new DriverDAO();
