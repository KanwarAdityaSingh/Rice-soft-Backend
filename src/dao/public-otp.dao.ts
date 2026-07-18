import { PoolClient } from 'pg';
import { db } from '../database/connection';
import { PublicOtpVerification } from '../models/public-otp.model';

export class PublicOtpDAO {
  async create(
    data: {
      phone: string;
      otp: string;
      purpose: string;
      expires_at: Date;
      ip?: string;
      user_agent?: string;
    },
    client?: PoolClient
  ): Promise<PublicOtpVerification> {
    const query = `
      INSERT INTO public_otp_verifications (
        phone, otp, purpose, expires_at, ip, user_agent
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const values = [
      data.phone,
      data.otp,
      data.purpose,
      data.expires_at,
      data.ip ?? null,
      data.user_agent ?? null,
    ];
    const result = client
      ? await client.query<PublicOtpVerification>(query, values)
      : await db.query<PublicOtpVerification>(query, values);
    return result.rows[0];
  }

  async findLatestUnverified(
    phone: string,
    purpose: string,
    client?: PoolClient
  ): Promise<PublicOtpVerification | null> {
    const query = `
      SELECT * FROM public_otp_verifications
      WHERE phone = $1 AND purpose = $2 AND verified = FALSE AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const result = client
      ? await client.query<PublicOtpVerification>(query, [phone, purpose])
      : await db.query<PublicOtpVerification>(query, [phone, purpose]);
    return result.rows[0] || null;
  }

  async markVerified(id: string, client?: PoolClient): Promise<void> {
    const query = `
      UPDATE public_otp_verifications
      SET verified = TRUE, verified_at = NOW()
      WHERE otp_verification_id = $1
    `;
    if (client) {
      await client.query(query, [id]);
    } else {
      await db.query(query, [id]);
    }
  }

  async incrementAttempts(id: string, client?: PoolClient): Promise<void> {
    const query = `
      UPDATE public_otp_verifications
      SET attempts = attempts + 1
      WHERE otp_verification_id = $1
    `;
    if (client) {
      await client.query(query, [id]);
    } else {
      await db.query(query, [id]);
    }
  }

  async countRecentOtps(phone: string, minutesAgo: number): Promise<number> {
    const query = `
      SELECT COUNT(*)::int AS count
      FROM public_otp_verifications
      WHERE phone = $1 AND created_at > NOW() - INTERVAL '${minutesAgo} minutes'
    `;
    const result = await db.query<{ count: number }>(query, [phone]);
    return result.rows[0].count;
  }
}
