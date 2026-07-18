import { PoolClient } from 'pg';
import { db } from '../database/connection';
import { RefreshToken, CreateRefreshTokenData } from '../models/refresh-token.model';

export class RefreshTokenDAO {
  async create(data: CreateRefreshTokenData, client?: PoolClient): Promise<RefreshToken> {
    const query = `
      INSERT INTO public_refresh_tokens (
        phone, token_hash, expires_at, ip, user_agent, device_info
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const values = [
      data.phone,
      data.token_hash,
      data.expires_at,
      data.ip ?? null,
      data.user_agent ?? null,
      data.device_info ? JSON.stringify(data.device_info) : null,
    ];
    const result = client
      ? await client.query<RefreshToken>(query, values)
      : await db.query<RefreshToken>(query, values);
    return result.rows[0];
  }

  async findByTokenHash(tokenHash: string, client?: PoolClient): Promise<RefreshToken | null> {
    const query = `
      SELECT * FROM public_refresh_tokens
      WHERE token_hash = $1 AND revoked = FALSE AND expires_at > NOW()
    `;
    const result = client
      ? await client.query<RefreshToken>(query, [tokenHash])
      : await db.query<RefreshToken>(query, [tokenHash]);
    return result.rows[0] || null;
  }

  async updateLastUsed(tokenId: string, client?: PoolClient): Promise<void> {
    const query = `
      UPDATE public_refresh_tokens
      SET last_used_at = NOW()
      WHERE refresh_token_id = $1
    `;
    if (client) {
      await client.query(query, [tokenId]);
    } else {
      await db.query(query, [tokenId]);
    }
  }

  async revoke(
    tokenId: string,
    reason: string,
    client?: PoolClient
  ): Promise<void> {
    const query = `
      UPDATE public_refresh_tokens
      SET revoked = TRUE, revoked_at = NOW(), revoked_reason = $2
      WHERE refresh_token_id = $1
    `;
    if (client) {
      await client.query(query, [tokenId, reason]);
    } else {
      await db.query(query, [tokenId, reason]);
    }
  }

  async revokeByTokenHash(
    tokenHash: string,
    reason: string,
    client?: PoolClient
  ): Promise<void> {
    const query = `
      UPDATE public_refresh_tokens
      SET revoked = TRUE, revoked_at = NOW(), revoked_reason = $2
      WHERE token_hash = $1
    `;
    if (client) {
      await client.query(query, [tokenHash, reason]);
    } else {
      await db.query(query, [tokenHash, reason]);
    }
  }

  async revokeAllByPhone(
    phone: string,
    reason: string,
    client?: PoolClient
  ): Promise<number> {
    const query = `
      UPDATE public_refresh_tokens
      SET revoked = TRUE, revoked_at = NOW(), revoked_reason = $2
      WHERE phone = $1 AND revoked = FALSE
    `;
    const result = client
      ? await client.query(query, [phone, reason])
      : await db.query(query, [phone, reason]);
    return result.rowCount || 0;
  }

  async findActiveByPhone(phone: string): Promise<RefreshToken[]> {
    const query = `
      SELECT * FROM public_refresh_tokens
      WHERE phone = $1 AND revoked = FALSE AND expires_at > NOW()
      ORDER BY created_at DESC
    `;
    const result = await db.query<RefreshToken>(query, [phone]);
    return result.rows;
  }

  async cleanupExpired(): Promise<number> {
    const query = `
      DELETE FROM public_refresh_tokens
      WHERE expires_at < NOW() - INTERVAL '30 days'
    `;
    const result = await db.query(query);
    return result.rowCount || 0;
  }
}
