import { db } from '../database/connection';
import {
  Driver,
  CreateDriverDTO,
  UpdateDriverDTO,
  isDriverVerifiedFromDetails,
  DriverVerificationSnapshot,
} from '../models/driver.model';
import { logger } from '../utils/logger';
import { ConflictError } from '../utils/errors';
import { normalizeDrivingLicenseForStorage, driverProfileFromMapped, parseTransportLicenseExpiryDate } from '../utils/driver-license';

const SELECT_COLUMNS = `
  id, license_number, phone, name, date_of_birth, license_expires_at,
  transport_license_expires_at, father_or_husband_name, state, city_name,
  address, pincode, gender, profile_image, vehicle_classes,
  is_verified, verified_at, verification_details,
  is_active, created_at, updated_at, created_by, updated_by
`;

export interface DriverListFilters {
  includeInactive?: boolean;
  isActive?: boolean;
  isVerified?: boolean;
}

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

function resolveLicenseExpiry(data: {
  license_expires_at?: string | null;
  doe?: string | null;
}): string | null {
  return toPgDate(data.license_expires_at ?? data.doe ?? null);
}

function resolveTransportLicenseExpiry(data: {
  transport_license_expires_at?: string | null;
  transport_doe?: string | null;
}): string | null {
  return parseTransportLicenseExpiryDate(
    data.transport_license_expires_at ?? data.transport_doe ?? null
  );
}

function profileFromVerificationDetails(
  details: CreateDriverDTO['verification_details']
): ReturnType<typeof driverProfileFromMapped> {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return driverProfileFromMapped(null);
  }
  return driverProfileFromMapped((details as DriverVerificationSnapshot).mapped);
}

export class DriverDAO {
  async findAll(filters: DriverListFilters = {}): Promise<Driver[]> {
    const { includeInactive = false, isActive, isVerified } = filters;

    let query = `SELECT ${SELECT_COLUMNS} FROM drivers WHERE 1=1`;
    const params: unknown[] = [];

    if (includeInactive) {
      if (isActive === true) {
        query += ` AND is_active = true`;
      } else if (isActive === false) {
        query += ` AND is_active = false`;
      }
    } else if (isActive === false) {
      query += ` AND is_active = false`;
    } else {
      query += ` AND is_active = true`;
    }

    if (isVerified === true) {
      query += ` AND is_verified = true`;
    } else if (isVerified === false) {
      query += ` AND is_verified = false`;
    }

    query += ` ORDER BY license_number ASC`;

    const result = await db.query<Driver>(query, params);
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
    const fromMapped = profileFromVerificationDetails(data.verification_details);

    const query = `
      INSERT INTO drivers (
        license_number, phone, name, date_of_birth, license_expires_at,
        transport_license_expires_at, father_or_husband_name, state, city_name,
        address, pincode, gender, profile_image, vehicle_classes,
        is_verified, verified_at, verification_details,
        is_active, created_by
      )
      VALUES (
        $1, $2, $3,
        $4::date, $5::date, $6::date, $7, $8, $9,
        $10, $11, $12, $13, $14,
        $15, $16, $17::jsonb,
        $18, $19
      )
      RETURNING ${SELECT_COLUMNS}
    `;
    const dob = toPgDate(data.date_of_birth ?? fromMapped.date_of_birth);
    const exp = resolveLicenseExpiry(data) ?? fromMapped.license_expires_at;
    const transportExp =
      resolveTransportLicenseExpiry(data) ?? fromMapped.transport_license_expires_at;
    const isVerified =
      data.is_verified !== undefined
        ? data.is_verified
        : isDriverVerifiedFromDetails(data.verification_details ?? null);

    const values = [
      license,
      data.phone.trim(),
      data.name?.trim() || fromMapped.name,
      dob,
      exp,
      transportExp,
      data.father_or_husband_name?.trim() || fromMapped.father_or_husband_name,
      data.state?.trim() || fromMapped.state,
      data.city_name?.trim() || fromMapped.city_name,
      data.address?.trim() || fromMapped.address,
      data.pincode?.trim() || fromMapped.pincode,
      data.gender?.trim() || fromMapped.gender,
      data.profile_image ?? fromMapped.profile_image,
      data.vehicle_classes ?? fromMapped.vehicle_classes,
      isVerified,
      isVerified ? data.verified_at || new Date() : null,
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
        throw new ConflictError('Driving license number already exists');
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
    if (data.license_expires_at !== undefined || data.doe !== undefined) {
      fields.push(`license_expires_at = $${paramCount++}::date`);
      values.push(resolveLicenseExpiry(data));
    }
    if (data.transport_license_expires_at !== undefined || data.transport_doe !== undefined) {
      fields.push(`transport_license_expires_at = $${paramCount++}::date`);
      values.push(resolveTransportLicenseExpiry(data));
    }
    if (data.father_or_husband_name !== undefined) {
      fields.push(`father_or_husband_name = $${paramCount++}`);
      values.push(data.father_or_husband_name?.trim() || null);
    }
    if (data.state !== undefined) {
      fields.push(`state = $${paramCount++}`);
      values.push(data.state?.trim() || null);
    }
    if (data.city_name !== undefined) {
      fields.push(`city_name = $${paramCount++}`);
      values.push(data.city_name?.trim() || null);
    }
    if (data.address !== undefined) {
      fields.push(`address = $${paramCount++}`);
      values.push(data.address?.trim() || null);
    }
    if (data.pincode !== undefined) {
      fields.push(`pincode = $${paramCount++}`);
      values.push(data.pincode?.trim() || null);
    }
    if (data.gender !== undefined) {
      fields.push(`gender = $${paramCount++}`);
      values.push(data.gender?.trim() || null);
    }
    if (data.profile_image !== undefined) {
      fields.push(`profile_image = $${paramCount++}`);
      values.push(data.profile_image || null);
    }
    if (data.vehicle_classes !== undefined) {
      fields.push(`vehicle_classes = $${paramCount++}`);
      values.push(data.vehicle_classes);
    }
    if (data.is_verified !== undefined) {
      fields.push(`is_verified = $${paramCount++}`);
      values.push(data.is_verified);
      fields.push(`verified_at = $${paramCount++}`);
      values.push(data.is_verified ? data.verified_at || new Date() : null);
    } else if (data.verified_at !== undefined) {
      fields.push(`verified_at = $${paramCount++}`);
      values.push(data.verified_at || null);
    }
    if (data.verification_details !== undefined) {
      fields.push(`verification_details = $${paramCount++}::jsonb`);
      values.push(
        data.verification_details != null ? JSON.stringify(data.verification_details) : null
      );

      if (data.is_verified === undefined) {
        const verified = isDriverVerifiedFromDetails(data.verification_details);
        fields.push(`is_verified = $${paramCount++}`);
        values.push(verified);
        fields.push(`verified_at = $${paramCount++}`);
        values.push(verified ? new Date() : null);
      }

      if (
        data.name === undefined ||
        data.date_of_birth === undefined ||
        data.license_expires_at === undefined ||
        data.doe === undefined ||
        data.transport_license_expires_at === undefined ||
        data.transport_doe === undefined ||
        data.father_or_husband_name === undefined ||
        data.state === undefined ||
        data.city_name === undefined ||
        data.address === undefined ||
        data.pincode === undefined ||
        data.gender === undefined ||
        data.profile_image === undefined ||
        data.vehicle_classes === undefined
      ) {
        const fromMapped = profileFromVerificationDetails(data.verification_details);
        if (data.name === undefined && fromMapped.name) {
          fields.push(`name = $${paramCount++}`);
          values.push(fromMapped.name);
        }
        if (data.date_of_birth === undefined && fromMapped.date_of_birth) {
          fields.push(`date_of_birth = $${paramCount++}::date`);
          values.push(fromMapped.date_of_birth);
        }
        if (
          data.license_expires_at === undefined &&
          data.doe === undefined &&
          fromMapped.license_expires_at
        ) {
          fields.push(`license_expires_at = $${paramCount++}::date`);
          values.push(fromMapped.license_expires_at);
        }
        if (
          data.transport_license_expires_at === undefined &&
          data.transport_doe === undefined &&
          fromMapped.transport_license_expires_at
        ) {
          fields.push(`transport_license_expires_at = $${paramCount++}::date`);
          values.push(fromMapped.transport_license_expires_at);
        }
        if (data.father_or_husband_name === undefined && fromMapped.father_or_husband_name) {
          fields.push(`father_or_husband_name = $${paramCount++}`);
          values.push(fromMapped.father_or_husband_name);
        }
        if (data.state === undefined && fromMapped.state) {
          fields.push(`state = $${paramCount++}`);
          values.push(fromMapped.state);
        }
        if (data.city_name === undefined && fromMapped.city_name) {
          fields.push(`city_name = $${paramCount++}`);
          values.push(fromMapped.city_name);
        }
        if (data.address === undefined && fromMapped.address) {
          fields.push(`address = $${paramCount++}`);
          values.push(fromMapped.address);
        }
        if (data.pincode === undefined && fromMapped.pincode) {
          fields.push(`pincode = $${paramCount++}`);
          values.push(fromMapped.pincode);
        }
        if (data.gender === undefined && fromMapped.gender) {
          fields.push(`gender = $${paramCount++}`);
          values.push(fromMapped.gender);
        }
        if (data.profile_image === undefined && fromMapped.profile_image) {
          fields.push(`profile_image = $${paramCount++}`);
          values.push(fromMapped.profile_image);
        }
        if (data.vehicle_classes === undefined && fromMapped.vehicle_classes.length > 0) {
          fields.push(`vehicle_classes = $${paramCount++}`);
          values.push(fromMapped.vehicle_classes);
        }
      }
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

  /** Tables/columns that reference this driver (FK, driver_id, or driver_ids[]). */
  private async findReferenceBlockers(driverId: string): Promise<Array<{ label: string; count: number }>> {
    const blockers: Array<{ label: string; count: number }> = [];

    const fkResult = await db.query<{ table_name: string; column_name: string }>(
      `
      SELECT
        cl.relname AS table_name,
        att.attname AS column_name
      FROM pg_constraint con
      JOIN pg_class cl ON cl.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = cl.relnamespace
      JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
      WHERE con.contype = 'f'
        AND con.confrelid = 'public.drivers'::regclass
        AND ns.nspname = 'public'
        AND cl.relname <> 'drivers'
        AND array_length(con.conkey, 1) = 1
      `
    );

    for (const { table_name, column_name } of fkResult.rows) {
      const countResult = await db.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM "${table_name}" WHERE "${column_name}" = $1`,
        [driverId]
      );
      const count = parseInt(countResult.rows[0]?.count ?? '0', 10);
      if (count > 0) {
        blockers.push({ label: table_name, count });
      }
    }

    const columnResult = await db.query<{ table_name: string; column_name: string; udt_name: string }>(
      `
      SELECT c.table_name, c.column_name, c.udt_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
        AND c.table_name <> 'drivers'
        AND c.column_name IN ('driver_id', 'driver_ids')
      `
    );

    for (const { table_name, column_name, udt_name } of columnResult.rows) {
      const alreadyCounted = blockers.some((b) => b.label === table_name);
      if (alreadyCounted) {
        continue;
      }

      if (column_name === 'driver_ids' && udt_name === '_uuid') {
        const countResult = await db.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM "${table_name}" WHERE $1 = ANY("${column_name}")`,
          [driverId]
        );
        const count = parseInt(countResult.rows[0]?.count ?? '0', 10);
        if (count > 0) {
          blockers.push({ label: table_name, count });
        }
        continue;
      }

      if (column_name === 'driver_id' && udt_name === 'uuid') {
        const countResult = await db.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM "${table_name}" WHERE "${column_name}" = $1`,
          [driverId]
        );
        const count = parseInt(countResult.rows[0]?.count ?? '0', 10);
        if (count > 0) {
          blockers.push({ label: table_name, count });
        }
      }
    }

    return blockers;
  }

  async delete(id: string): Promise<boolean> {
    const blockers = await this.findReferenceBlockers(id);
    if (blockers.length > 0) {
      const details = blockers.map((b) => `${b.label} (${b.count})`).join(', ');
      throw new ConflictError(`Cannot delete driver linked to: ${details}`);
    }

    const query = `DELETE FROM drivers WHERE id = $1`;
    const result = await db.query(query, [id]);
    const ok = (result.rowCount || 0) > 0;
    if (ok) {
      logger.info('Driver deleted', { id });
    }
    return ok;
  }
}

export const driverDAO = new DriverDAO();
