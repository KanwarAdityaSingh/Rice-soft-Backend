import { PoolClient } from 'pg';
import { db } from '../database/connection';
import { CouponAllotmentLineCoupon } from '../models/coupon-allotment.model';

export class CouponAllotmentLineCouponDAO {
  async bulkInsert(
    couponAllotmentLineId: string,
    couponIds: string[],
    client: PoolClient
  ): Promise<CouponAllotmentLineCoupon[]> {
    if (couponIds.length === 0) return [];

    const values: unknown[] = [];
    const placeholders: string[] = [];
    let i = 1;
    for (const couponId of couponIds) {
      placeholders.push(`($${i++}, $${i++})`);
      values.push(couponAllotmentLineId, couponId);
    }

    const result = await client.query<CouponAllotmentLineCoupon>(
      `
      INSERT INTO coupon_allotment_line_coupons (coupon_allotment_line_id, coupon_id)
      VALUES ${placeholders.join(', ')}
      RETURNING *
      `,
      values
    );
    return result.rows;
  }

  /** Currently-linked coupon ids for a line (unlinked_at IS NULL), locked for the unlink transaction. */
  async findActiveCouponIdsByLineId(
    couponAllotmentLineId: string,
    client: PoolClient
  ): Promise<string[]> {
    const result = await client.query<{ coupon_id: string }>(
      `SELECT coupon_id FROM coupon_allotment_line_coupons
       WHERE coupon_allotment_line_id = $1 AND unlinked_at IS NULL`,
      [couponAllotmentLineId]
    );
    return result.rows.map((r) => r.coupon_id);
  }

  /**
   * Still-allotted (not redeemed) coupons on a ledger line, highest serial first —
   * used so credit-note proportional unlinks peel from the end of the range.
   */
  async findActiveAllottedCouponIdsByLineIdDesc(
    couponAllotmentLineId: string,
    limit: number,
    client: PoolClient
  ): Promise<string[]> {
    if (limit <= 0) return [];
    const result = await client.query<{ coupon_id: string }>(
      `SELECT clc.coupon_id
       FROM coupon_allotment_line_coupons clc
       JOIN coupons c ON c.coupon_id = clc.coupon_id
       WHERE clc.coupon_allotment_line_id = $1
         AND clc.unlinked_at IS NULL
         AND c.status = 'allotted'
       ORDER BY c.batch_sequence DESC
       LIMIT $2
       FOR UPDATE OF clc, c`,
      [couponAllotmentLineId, limit]
    );
    return result.rows.map((r) => r.coupon_id);
  }

  /** Remaining active links + serial bounds after a partial unlink. */
  async getActiveLinkSummaryByLineId(
    couponAllotmentLineId: string,
    client: PoolClient
  ): Promise<{ count: number; from_serial: string | null; to_serial: string | null }> {
    const result = await client.query<{
      count: string;
      from_serial: string | null;
      to_serial: string | null;
    }>(
      `SELECT COUNT(*)::text AS count,
              MIN(c.serial_number) AS from_serial,
              MAX(c.serial_number) AS to_serial
       FROM coupon_allotment_line_coupons clc
       JOIN coupons c ON c.coupon_id = clc.coupon_id
       WHERE clc.coupon_allotment_line_id = $1 AND clc.unlinked_at IS NULL`,
      [couponAllotmentLineId]
    );
    const row = result.rows[0];
    return {
      count: parseInt(row?.count ?? '0', 10),
      from_serial: row?.from_serial ?? null,
      to_serial: row?.to_serial ?? null,
    };
  }

  async markUnlinkedByLineId(
    couponAllotmentLineId: string,
    reason: string,
    client: PoolClient
  ): Promise<number> {
    const result = await client.query(
      `UPDATE coupon_allotment_line_coupons
       SET unlinked_at = CURRENT_TIMESTAMP, unlinked_reason = $2
       WHERE coupon_allotment_line_id = $1 AND unlinked_at IS NULL`,
      [couponAllotmentLineId, reason]
    );
    return result.rowCount ?? 0;
  }

  async markUnlinkedByCouponIds(
    couponAllotmentLineId: string,
    couponIds: string[],
    reason: string,
    client: PoolClient
  ): Promise<number> {
    if (couponIds.length === 0) return 0;
    const result = await client.query(
      `UPDATE coupon_allotment_line_coupons
       SET unlinked_at = CURRENT_TIMESTAMP, unlinked_reason = $3
       WHERE coupon_allotment_line_id = $1
         AND coupon_id = ANY($2::uuid[])
         AND unlinked_at IS NULL`,
      [couponAllotmentLineId, couponIds, reason]
    );
    return result.rowCount ?? 0;
  }

  async findUnlinkedByReason(
    reason: string,
    client: PoolClient
  ): Promise<Array<{ coupon_allotment_line_id: string; coupon_id: string }>> {
    const result = await client.query<{
      coupon_allotment_line_id: string;
      coupon_id: string;
    }>(
      `SELECT coupon_allotment_line_id, coupon_id
       FROM coupon_allotment_line_coupons
       WHERE unlinked_reason = $1 AND unlinked_at IS NOT NULL
       FOR UPDATE`,
      [reason]
    );
    return result.rows;
  }

  async clearUnlinkedByCouponIds(
    couponAllotmentLineId: string,
    couponIds: string[],
    client: PoolClient
  ): Promise<number> {
    if (couponIds.length === 0) return 0;
    const result = await client.query(
      `UPDATE coupon_allotment_line_coupons
       SET unlinked_at = NULL, unlinked_reason = NULL
       WHERE coupon_allotment_line_id = $1
         AND coupon_id = ANY($2::uuid[])
         AND unlinked_at IS NOT NULL`,
      [couponAllotmentLineId, couponIds]
    );
    return result.rowCount ?? 0;
  }

  /**
   * First/last allotment event timestamps for a batch, based on when coupons were ever
   * linked — an event that was later unlinked (invoice cancelled) still counts as having
   * happened, so this deliberately does not filter on unlinked_at.
   */
  async getFirstLastLinkedAtForBatch(
    couponBatchId: string
  ): Promise<{ first_allotted_at: Date | null; last_allotted_at: Date | null }> {
    const result = await db.query<{ first_allotted_at: Date | null; last_allotted_at: Date | null }>(
      `
      SELECT MIN(clc.linked_at) AS first_allotted_at, MAX(clc.linked_at) AS last_allotted_at
      FROM coupon_allotment_line_coupons clc
      JOIN coupon_allotment_lines cal ON cal.id = clc.coupon_allotment_line_id
      WHERE cal.coupon_batch_id = $1
      `,
      [couponBatchId]
    );
    return (
      result.rows[0] || {
        first_allotted_at: null,
        last_allotted_at: null,
      }
    );
  }
}

export const couponAllotmentLineCouponDAO = new CouponAllotmentLineCouponDAO();
