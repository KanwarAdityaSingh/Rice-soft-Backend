import { db } from '../database/connection';
import { LoginHistory, CreateLoginHistoryDTO, LoginHistoryFilters } from '../models/login-history.model';
import { logger } from '../utils/logger';

export class LoginHistoryDAO {
  async create(loginData: CreateLoginHistoryDTO): Promise<LoginHistory> {
    const query = `
      INSERT INTO login_history (user_id, ip_address, user_agent, device_type, browser, operating_system, login_status, failure_reason)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, user_id, ip_address, user_agent, device_type, browser, operating_system, login_status, failure_reason, login_at, created_at
    `;

    const values = [
      loginData.user_id,
      loginData.ip_address || null,
      loginData.user_agent || null,
      loginData.device_type || null,
      loginData.browser || null,
      loginData.operating_system || null,
      loginData.login_status,
      loginData.failure_reason || null,
    ];

    const result = await db.query<LoginHistory>(query, values);
    const loginHistory = result.rows[0];

    logger.info('Login history created', {
      loginHistoryId: loginHistory.id,
      userId: loginHistory.user_id,
      status: loginHistory.login_status,
    });

    return loginHistory;
  }

  async findByUserId(userId: string, filters?: LoginHistoryFilters): Promise<LoginHistory[]> {
    let query = `
      SELECT id, user_id, ip_address, user_agent, device_type, browser, operating_system, login_status, failure_reason, login_at, created_at
      FROM login_history
      WHERE user_id = $1
    `;

    const params: any[] = [userId];
    let paramCount = 1;

    if (filters?.login_status) {
      paramCount++;
      query += ` AND login_status = $${paramCount}`;
      params.push(filters.login_status);
    }

    if (filters?.start_date) {
      paramCount++;
      query += ` AND login_at >= $${paramCount}`;
      params.push(filters.start_date);
    }

    if (filters?.end_date) {
      paramCount++;
      query += ` AND login_at <= $${paramCount}`;
      params.push(filters.end_date);
    }

    query += ` ORDER BY login_at DESC`;

    if (filters?.limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      params.push(filters.limit);
    }

    if (filters?.offset) {
      paramCount++;
      query += ` OFFSET $${paramCount}`;
      params.push(filters.offset);
    }

    const result = await db.query<LoginHistory>(query, params);
    return result.rows;
  }

  async getRecentLogins(userId: string, limit = 10): Promise<LoginHistory[]> {
    const query = `
      SELECT id, user_id, ip_address, user_agent, device_type, browser, operating_system, login_status, failure_reason, login_at, created_at
      FROM login_history
      WHERE user_id = $1
      ORDER BY login_at DESC
      LIMIT $2
    `;

    const result = await db.query<LoginHistory>(query, [userId, limit]);
    return result.rows;
  }

  async getFailedLoginAttempts(userId: string, minutes = 15): Promise<number> {
    const query = `
      SELECT COUNT(*) as count
      FROM login_history
      WHERE user_id = $1
        AND login_status = 'failed'
        AND login_at >= NOW() - INTERVAL '${minutes} minutes'
    `;

    const result = await db.query<{ count: string }>(query, [userId]);
    return parseInt(result.rows[0].count, 10);
  }
}
