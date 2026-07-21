import { db } from '../database/connection';
import {
  Salesman,
  CreateSalesmanDTO,
  UpdateSalesmanDTO,
  Address,
  BankDetails,
} from '../models/salesman.model';
import {
  mergeEntityKycDetailsPatch,
  parseEntityKycDetails,
  isSalesmanKycVerified,
} from '../utils/kyc-verification';
import { logger } from '../utils/logger';

const COLUMNS = `
  id, salesperson_code, name, phone, alternate_phone, email,
  date_of_birth, date_of_joining, designation,
  aadhar_number, pan_number, address, bank_details,
  bank_details_verified_at, bank_details_verified_by, bank_verification_error,
  kyc_verification_details, is_verified, verified_at,
  salary_type, basic_salary, salary_effective_from,
  commission_types,
  is_active, user_id, created_at, updated_at, created_by, updated_by`;

function transformSalesman(row: Salesman): Salesman {
  return {
    ...row,
    alternate_phone: row.alternate_phone ?? null,
    address: (row.address || {}) as Address,
    bank_details: (row.bank_details || null) as BankDetails | null,
    bank_details_verified_at: row.bank_details_verified_at ?? null,
    bank_details_verified_by: row.bank_details_verified_by ?? null,
    bank_verification_error: row.bank_verification_error ?? null,
    kyc_verification_details: parseEntityKycDetails(row.kyc_verification_details),
    basic_salary: row.basic_salary != null ? Number(row.basic_salary) : null,
    commission_types: Array.isArray(row.commission_types) ? row.commission_types : [],
  };
}

export class SalesmanDAO {
  async findAll(includeInactive = false): Promise<Salesman[]> {
    const query = `
      SELECT ${COLUMNS}
      FROM salesmen
      ${includeInactive ? '' : 'WHERE is_active = true'}
      ORDER BY name ASC
    `;
    const result = await db.query<Salesman>(query);
    return result.rows.map(transformSalesman);
  }

  async findById(id: string): Promise<Salesman | null> {
    const result = await db.query<Salesman>(
      `SELECT ${COLUMNS} FROM salesmen WHERE id = $1`,
      [id]
    );
    return result.rows[0] ? transformSalesman(result.rows[0]) : null;
  }

  async findByEmail(email: string): Promise<Salesman | null> {
    const result = await db.query<Salesman>(
      `SELECT ${COLUMNS} FROM salesmen WHERE email = $1`,
      [email]
    );
    return result.rows[0] ? transformSalesman(result.rows[0]) : null;
  }

  async create(data: CreateSalesmanDTO & { user_id?: string }): Promise<Salesman> {
    const kycDetails = mergeEntityKycDetailsPatch({}, data.kyc_verification_details);
    const isVerified = isSalesmanKycVerified(kycDetails);

    const query = `
      INSERT INTO salesmen (
        name, phone, alternate_phone, email,
        date_of_birth, date_of_joining, designation,
        aadhar_number, pan_number, address, bank_details,
        kyc_verification_details, is_verified, verified_at,
        salary_type, basic_salary, salary_effective_from,
        commission_types,
        is_active, created_by, user_id
      )
      VALUES (
        $1, $2, $3, $4,
        $5::date, $6::date, $7,
        $8, $9, $10::jsonb, $11::jsonb,
        $12::jsonb, $13, $14,
        $15, $16, $17::date,
        $18,
        $19, $20, $21
      )
      RETURNING ${COLUMNS}
    `;

    const values = [
      data.name,
      data.phone,
      data.alternate_phone || null,
      data.email?.trim() || null,
      data.date_of_birth || null,
      data.date_of_joining || null,
      data.designation || null,
      data.aadhar_number || null,
      data.pan_number ? data.pan_number.toUpperCase() : null,
      JSON.stringify(data.address || {}),
      data.bank_details ? JSON.stringify(data.bank_details) : null,
      JSON.stringify(kycDetails),
      isVerified,
      isVerified ? new Date() : null,
      data.salary_type || null,
      data.basic_salary ?? null,
      data.salary_effective_from || null,
      data.commission_types ?? [],
      data.is_active !== undefined ? data.is_active : true,
      data.created_by || null,
      data.user_id || null,
    ];

    const result = await db.query<Salesman>(query, values);
    const salesman = transformSalesman(result.rows[0]);

    logger.info('Salesman created', {
      salesmanId: salesman.id,
      salespersonCode: salesman.salesperson_code,
      name: salesman.name,
    });

    return salesman;
  }

  async update(id: string, data: UpdateSalesmanDTO): Promise<Salesman | null> {
    const updateFields: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    const push = (sql: string, value: unknown) => {
      updateFields.push(`${sql} $${paramCount++}`);
      values.push(value);
    };

    if (data.name !== undefined) push('name =', data.name);
    if (data.phone !== undefined) push('phone =', data.phone);
    if (data.alternate_phone !== undefined) push('alternate_phone =', data.alternate_phone || null);
    if (data.email !== undefined) push('email =', data.email?.trim() || null);
    if (data.date_of_birth !== undefined) push('date_of_birth =', data.date_of_birth || null);
    if (data.date_of_joining !== undefined) push('date_of_joining =', data.date_of_joining || null);
    if (data.designation !== undefined) push('designation =', data.designation || null);
    if (data.aadhar_number !== undefined) push('aadhar_number =', data.aadhar_number || null);
    if (data.pan_number !== undefined) {
      push('pan_number =', data.pan_number ? data.pan_number.toUpperCase() : null);
    }
    if (data.address !== undefined) push('address =', JSON.stringify(data.address));
    if (data.bank_details !== undefined) {
      push('bank_details =', JSON.stringify(data.bank_details));
      updateFields.push('bank_details_verified_at = NULL');
      updateFields.push('bank_details_verified_by = NULL');
      updateFields.push('bank_verification_error = NULL');
    }
    if (data.salary_type !== undefined) push('salary_type =', data.salary_type || null);
    if (data.basic_salary !== undefined) push('basic_salary =', data.basic_salary);
    if (data.salary_effective_from !== undefined) {
      push('salary_effective_from =', data.salary_effective_from || null);
    }
    if (data.commission_types !== undefined) push('commission_types =', data.commission_types);
    if (data.is_active !== undefined) push('is_active =', data.is_active);
    if (data.updated_by !== undefined) push('updated_by =', data.updated_by);

    if (data.kyc_verification_details !== undefined) {
      const existing = await db.query<{ kyc_verification_details: unknown }>(
        `SELECT kyc_verification_details FROM salesmen WHERE id = $1`,
        [id]
      );
      const merged = mergeEntityKycDetailsPatch(
        parseEntityKycDetails(existing.rows[0]?.kyc_verification_details),
        data.kyc_verification_details
      );
      push('kyc_verification_details =', JSON.stringify(merged));
      const verified = isSalesmanKycVerified(merged);
      push('is_verified =', verified);
      push('verified_at =', verified ? new Date() : null);
    }

    if (updateFields.length === 0) {
      return this.findById(id);
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const result = await db.query<Salesman>(
      `UPDATE salesmen SET ${updateFields.join(', ')} WHERE id = $${paramCount}
       RETURNING ${COLUMNS}`,
      values
    );

    const salesman = result.rows[0] ? transformSalesman(result.rows[0]) : null;
    if (salesman) {
      logger.info('Salesman updated', { salesmanId: salesman.id });
    }
    return salesman;
  }

  /** Apply current salary fields when history upsert is the latest effective_from. */
  async setCurrentSalary(
    id: string,
    salary: {
      salary_type: string;
      basic_salary: number;
      salary_effective_from: string;
    }
  ): Promise<Salesman | null> {
    const result = await db.query<Salesman>(
      `UPDATE salesmen
       SET salary_type = $2,
           basic_salary = $3,
           salary_effective_from = $4::date,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [id, salary.salary_type, salary.basic_salary, salary.salary_effective_from]
    );
    return result.rows[0] ? transformSalesman(result.rows[0]) : null;
  }

  async markBankDetailsVerified(id: string, verifiedByUserId: string): Promise<Salesman | null> {
    const result = await db.query<Salesman>(
      `UPDATE salesmen
       SET bank_details_verified_at = CURRENT_TIMESTAMP,
           bank_details_verified_by = $2,
           bank_verification_error = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [id, verifiedByUserId]
    );
    return result.rows[0] ? transformSalesman(result.rows[0]) : null;
  }

  async setBankVerificationError(id: string, message: string | null): Promise<Salesman | null> {
    const result = await db.query<Salesman>(
      `UPDATE salesmen
       SET bank_verification_error = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [id, message]
    );
    return result.rows[0] ? transformSalesman(result.rows[0]) : null;
  }

  async delete(id: string): Promise<void> {
    await db.query('DELETE FROM salesmen WHERE id = $1', [id]);
    logger.info('Salesman deleted', { salesmanId: id });
  }

  async emailExists(email: string, excludeId?: string): Promise<boolean> {
    const query = excludeId
      ? 'SELECT 1 FROM salesmen WHERE email = $1 AND id != $2 LIMIT 1'
      : 'SELECT 1 FROM salesmen WHERE email = $1 LIMIT 1';
    const result = await db.query(query, excludeId ? [email, excludeId] : [email]);
    return result.rows.length > 0;
  }

  async aadharExists(aadharNumber: string, excludeId?: string): Promise<boolean> {
    const query = excludeId
      ? 'SELECT 1 FROM salesmen WHERE aadhar_number = $1 AND id != $2 LIMIT 1'
      : 'SELECT 1 FROM salesmen WHERE aadhar_number = $1 LIMIT 1';
    const result = await db.query(query, excludeId ? [aadharNumber, excludeId] : [aadharNumber]);
    return result.rows.length > 0;
  }

  async panExists(panNumber: string, excludeId?: string): Promise<boolean> {
    const pan = panNumber.toUpperCase();
    const query = excludeId
      ? 'SELECT 1 FROM salesmen WHERE pan_number = $1 AND id != $2 LIMIT 1'
      : 'SELECT 1 FROM salesmen WHERE pan_number = $1 LIMIT 1';
    const result = await db.query(query, excludeId ? [pan, excludeId] : [pan]);
    return result.rows.length > 0;
  }
}

export const salesmanDAO = new SalesmanDAO();
