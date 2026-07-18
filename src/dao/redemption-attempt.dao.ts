import { PoolClient } from 'pg';
import { db } from '../database/connection';
import { RedemptionAttempt } from '../models/coupon.model';
import { appendDateRangeConditions } from '../utils/analytics-date-filter';

export class RedemptionAttemptDAO {
  async insert(
    data: {
      code_attempted?: string | null;
      phone?: string | null;
      ip?: string | null;
      failure_reason: string;
    },
    client?: PoolClient
  ): Promise<RedemptionAttempt> {
    const query = `
      INSERT INTO redemption_attempts (code_attempted, phone, ip, failure_reason)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const values = [
      data.code_attempted ?? null,
      data.phone ?? null,
      data.ip ?? null,
      data.failure_reason,
    ];
    const result = client
      ? await client.query<RedemptionAttempt>(query, values)
      : await db.query<RedemptionAttempt>(query, values);
    return result.rows[0];
  }

  async findAll(filters: {
    code?: string;
    phone?: string;
    ip?: string;
    failureReason?: string;
    fromDate?: string;
    toDate?: string;
    page?: number;
    limit?: number;
  }): Promise<{ rows: RedemptionAttempt[]; total: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;
    const offset = (page - 1) * limit;
    const conditions = ['1=1'];
    const values: unknown[] = [];
    let i = 1;

    if (filters.code) {
      conditions.push(`code_attempted ILIKE $${i++}`);
      values.push(`${filters.code.toUpperCase()}%`);
    }
    if (filters.phone) {
      conditions.push(`phone = $${i++}`);
      values.push(filters.phone);
    }
    if (filters.ip) {
      conditions.push(`ip::text = $${i++}`);
      values.push(filters.ip);
    }
    if (filters.failureReason) {
      conditions.push(`failure_reason = $${i++}`);
      values.push(filters.failureReason);
    }
    appendDateRangeConditions(conditions, values, 'created_at', filters.fromDate, filters.toDate);

    const where = conditions.join(' AND ');

    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM redemption_attempts WHERE ${where}`,
      values
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    values.push(limit, offset);
    const limitIdx = values.length - 1;
    const offsetIdx = values.length;
    const result = await db.query<RedemptionAttempt>(
      `SELECT * FROM redemption_attempts WHERE ${where}
       ORDER BY created_at DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      values
    );
    return { rows: result.rows, total };
  }
}
