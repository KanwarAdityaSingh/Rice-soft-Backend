import { PoolClient } from 'pg';
import { db } from '../database/connection';
import { Redeemer } from '../models/coupon.model';
import type { EntityKycVerificationDetails } from '../models/kyc-verification.model';

export interface UpsertRedeemerInput {
  phone: string;
  name?: string;
  upi_vpa?: string;
  account_holder_name?: string;
  account_number?: string;
  ifsc?: string;
  bank_name?: string;
}

function bankFieldsChanged(existing: Redeemer | null, data: UpsertRedeemerInput): boolean {
  if (!existing) return false;
  const norm = (v: string | null | undefined) => (v ?? '').trim();
  return (
    norm(data.account_holder_name) !== norm(existing.account_holder_name) ||
    norm(data.account_number) !== norm(existing.account_number) ||
    norm(data.ifsc) !== norm(existing.ifsc) ||
    norm(data.bank_name) !== norm(existing.bank_name)
  );
}

export class RedeemerDAO {
  async findByPhone(phone: string, client?: PoolClient): Promise<Redeemer | null> {
    const query = `SELECT * FROM redeemers WHERE phone = $1`;
    const result = client
      ? await client.query<Redeemer>(query, [phone])
      : await db.query<Redeemer>(query, [phone]);
    return result.rows[0] || null;
  }

  async findByPhoneForUpdate(phone: string, client: PoolClient): Promise<Redeemer | null> {
    const result = await client.query<Redeemer>(
      `SELECT * FROM redeemers WHERE phone = $1 FOR UPDATE`,
      [phone]
    );
    return result.rows[0] || null;
  }

  async findById(id: string, client?: PoolClient): Promise<Redeemer | null> {
    const query = `SELECT * FROM redeemers WHERE redeemer_id = $1`;
    const result = client
      ? await client.query<Redeemer>(query, [id])
      : await db.query<Redeemer>(query, [id]);
    return result.rows[0] || null;
  }

  async upsert(data: UpsertRedeemerInput, client: PoolClient): Promise<Redeemer> {
    const existing = await this.findByPhone(data.phone, client);
    const clearBankKyc = bankFieldsChanged(existing, data);

    const query = `
      INSERT INTO redeemers (
        phone, name, upi_vpa, account_holder_name, account_number, ifsc, bank_name
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (phone) DO UPDATE SET
        name = COALESCE(EXCLUDED.name, redeemers.name),
        upi_vpa = COALESCE(EXCLUDED.upi_vpa, redeemers.upi_vpa),
        account_holder_name = COALESCE(EXCLUDED.account_holder_name, redeemers.account_holder_name),
        account_number = COALESCE(EXCLUDED.account_number, redeemers.account_number),
        ifsc = COALESCE(EXCLUDED.ifsc, redeemers.ifsc),
        bank_name = COALESCE(EXCLUDED.bank_name, redeemers.bank_name),
        kyc_verification_details = CASE
          WHEN $8 THEN NULL
          ELSE redeemers.kyc_verification_details
        END,
        bank_details_verified_at = CASE
          WHEN $8 THEN NULL
          ELSE redeemers.bank_details_verified_at
        END,
        bank_verification_error = CASE
          WHEN $8 THEN NULL
          ELSE redeemers.bank_verification_error
        END,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    const values = [
      data.phone,
      data.name ?? null,
      data.upi_vpa ?? null,
      data.account_holder_name ?? null,
      data.account_number ?? null,
      data.ifsc ?? null,
      data.bank_name ?? null,
      clearBankKyc,
    ];
    const result = await client.query<Redeemer>(query, values);
    return result.rows[0];
  }

  async markBankDetailsVerified(
    redeemerId: string,
    kyc: EntityKycVerificationDetails,
    client: PoolClient
  ): Promise<void> {
    await client.query(
      `
      UPDATE redeemers SET
        kyc_verification_details = $2,
        bank_details_verified_at = CURRENT_TIMESTAMP,
        bank_verification_error = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE redeemer_id = $1
      `,
      [redeemerId, JSON.stringify(kyc)]
    );
  }

  async setBankVerificationError(
    redeemerId: string,
    message: string | null,
    client: PoolClient
  ): Promise<void> {
    await client.query(
      `
      UPDATE redeemers SET
        bank_verification_error = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE redeemer_id = $1
      `,
      [redeemerId, message]
    );
  }

  async incrementStats(
    redeemerId: string,
    earnedPaise: number,
    client: PoolClient
  ): Promise<void> {
    await client.query(
      `
      UPDATE redeemers SET
        total_redemptions = total_redemptions + 1,
        lifetime_earned_paise = lifetime_earned_paise + $2,
        first_redeemed_at = COALESCE(first_redeemed_at, NOW()),
        last_redeemed_at = NOW(),
        updated_at = CURRENT_TIMESTAMP
      WHERE redeemer_id = $1
      `,
      [redeemerId, earnedPaise]
    );
  }

  async findAll(page = 1, limit = 50): Promise<{ rows: Redeemer[]; total: number }> {
    const offset = (page - 1) * limit;
    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM redeemers`
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);
    const result = await db.query<Redeemer>(
      `SELECT * FROM redeemers ORDER BY last_redeemed_at DESC NULLS LAST LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return { rows: result.rows, total };
  }
}
