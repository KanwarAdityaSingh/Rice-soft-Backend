import { db } from '../database/connection';
import { logger } from '../utils/logger';

export interface OtpCode {
  id: string;
  user_id: string;
  phone: string;
  otp_hash: string;
  attempts: number;
  is_used: boolean;
  expires_at: Date;
  last_sent_at: Date;
  created_at: Date;
}

export class OtpDAO {
  async create(params: {
    user_id: string;
    phone: string;
    otp_hash: string;
    expires_at: Date;
  }): Promise<OtpCode> {
    const query = `
      INSERT INTO otp_codes (user_id, phone, otp_hash, expires_at)
      VALUES ($1, $2, $3, $4)
      RETURNING id, user_id, phone, otp_hash, attempts, is_used, expires_at, last_sent_at, created_at
    `;
    const values = [params.user_id, params.phone, params.otp_hash, params.expires_at];
    const result = await db.query<OtpCode>(query, values);
    const row = result.rows[0];
    logger.debug('OTP created', { id: row.id, user_id: row.user_id });
    return row;
  }

  async findLatestActiveByPhone(phone: string): Promise<OtpCode | null> {
    const query = `
      SELECT id, user_id, phone, otp_hash, attempts, is_used, expires_at, last_sent_at, created_at
      FROM otp_codes
      WHERE phone = $1
        AND is_used = false
        AND expires_at >= NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const result = await db.query<OtpCode>(query, [phone]);
    return result.rows[0] || null;
  }

  async markUsed(id: string): Promise<void> {
    const query = `
      UPDATE otp_codes
      SET is_used = true
      WHERE id = $1
    `;
    await db.query(query, [id]);
  }

  async incrementAttempts(id: string): Promise<number> {
    const query = `
      UPDATE otp_codes
      SET attempts = attempts + 1
      WHERE id = $1
      RETURNING attempts
    `;
    const result = await db.query<{ attempts: number }>(query, [id]);
    return result.rows[0]?.attempts ?? 0;
  }

  async updateLastSentAt(id: string): Promise<void> {
    const query = `
      UPDATE otp_codes
      SET last_sent_at = NOW()
      WHERE id = $1
    `;
    await db.query(query, [id]);
  }
}

export const otpDAO = new OtpDAO();


