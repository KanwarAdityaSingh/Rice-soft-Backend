import { PoolClient } from 'pg';
import { db } from '../database/connection';
import {
  AllotmentHistoryFilters,
  AllotmentHistoryRow,
  CouponAllotmentLine,
  CouponAllotmentLineDetail,
  CreateCouponAllotmentLineDTO,
} from '../models/coupon-allotment.model';
import { buildNormalizedSearchClause } from '../utils/search';

/** Shared "Rice Variety" display label: product name, or lot number + rice category. */
const VARIETY_LABEL_SELECT = `
  CASE
    WHEN idl.product_id IS NOT NULL THEN p.name
    WHEN idl.lot_id IS NOT NULL THEN 'Lot ' || l.lot_number || ' (' || l.rice_category || ')'
    ELSE 'Unknown'
  END
`;

const VARIETY_LABEL_JOIN = `
  JOIN invoice_dispatch_lines idl ON idl.id = cal.invoice_dispatch_line_id
  LEFT JOIN products p ON p.id = idl.product_id
  LEFT JOIN inward_slip_lots l ON l.id = idl.lot_id
`;

export class CouponAllotmentLineDAO {
  async create(data: CreateCouponAllotmentLineDTO, client: PoolClient): Promise<CouponAllotmentLine> {
    const query = `
      INSERT INTO coupon_allotment_lines (
        coupon_allotment_header_id, invoice_dispatch_line_id, coupon_batch_id,
        face_value_paise, coupons_required, coupons_allotted, from_serial, to_serial, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    const values = [
      data.coupon_allotment_header_id,
      data.invoice_dispatch_line_id,
      data.coupon_batch_id,
      data.face_value_paise,
      data.coupons_required,
      data.coupons_allotted,
      data.from_serial,
      data.to_serial,
      data.created_by ?? null,
    ];
    const result = await client.query<CouponAllotmentLine>(query, values);
    return result.rows[0];
  }

  async findById(id: string, client?: PoolClient): Promise<CouponAllotmentLine | null> {
    const query = `SELECT * FROM coupon_allotment_lines WHERE id = $1`;
    const result = client
      ? await client.query<CouponAllotmentLine>(query, [id])
      : await db.query<CouponAllotmentLine>(query, [id]);
    return result.rows[0] || null;
  }

  async findByIdForUpdate(id: string, client: PoolClient): Promise<CouponAllotmentLine | null> {
    const result = await client.query<CouponAllotmentLine>(
      `SELECT * FROM coupon_allotment_lines WHERE id = $1 FOR UPDATE`,
      [id]
    );
    return result.rows[0] || null;
  }

  /** Active (not-yet-unlinked) lines for one invoice dispatch line — used to compute outstanding bags. */
  async findActiveByInvoiceDispatchLineId(
    invoiceDispatchLineId: string,
    client?: PoolClient
  ): Promise<CouponAllotmentLine[]> {
    const query = `
      SELECT * FROM coupon_allotment_lines
      WHERE invoice_dispatch_line_id = $1 AND status = 'active'
      ORDER BY created_at ASC
    `;
    const result = client
      ? await client.query<CouponAllotmentLine>(query, [invoiceDispatchLineId])
      : await db.query<CouponAllotmentLine>(query, [invoiceDispatchLineId]);
    return result.rows;
  }

  /**
   * Active lines for one dispatch line, newest first, row-locked —
   * credit-note proportional unlink peels from the most recent batch assignment.
   */
  async findActiveByInvoiceDispatchLineIdForUpdateDesc(
    invoiceDispatchLineId: string,
    client: PoolClient
  ): Promise<CouponAllotmentLine[]> {
    const result = await client.query<CouponAllotmentLine>(
      `SELECT * FROM coupon_allotment_lines
       WHERE invoice_dispatch_line_id = $1 AND status = 'active'
       ORDER BY created_at DESC
       FOR UPDATE`,
      [invoiceDispatchLineId]
    );
    return result.rows;
  }

  async updateAllottedCountAndSerials(
    id: string,
    couponsAllotted: number,
    fromSerial: string | null,
    toSerial: string | null,
    client: PoolClient
  ): Promise<CouponAllotmentLine | null> {
    const result = await client.query<CouponAllotmentLine>(
      `UPDATE coupon_allotment_lines
       SET coupons_allotted = $2,
           from_serial = $3,
           to_serial = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'active'
       RETURNING *`,
      [id, couponsAllotted, fromSerial, toSerial]
    );
    return result.rows[0] || null;
  }

  /** Active lines under a header — used when reversing all of an invoice's allotments on cancel. */
  async findActiveByHeaderId(headerId: string, client: PoolClient): Promise<CouponAllotmentLine[]> {
    const result = await client.query<CouponAllotmentLine>(
      `SELECT * FROM coupon_allotment_lines
       WHERE coupon_allotment_header_id = $1 AND status = 'active'
       FOR UPDATE`,
      [headerId]
    );
    return result.rows;
  }

  async markUnlinked(
    id: string,
    reason: string,
    client: PoolClient
  ): Promise<CouponAllotmentLine | null> {
    const result = await client.query<CouponAllotmentLine>(
      `UPDATE coupon_allotment_lines
       SET status = 'unlinked', unlinked_at = CURRENT_TIMESTAMP, unlinked_reason = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id, reason]
    );
    return result.rows[0] || null;
  }

  async reactivateUnlinked(
    id: string,
    client: PoolClient
  ): Promise<CouponAllotmentLine | null> {
    const result = await client.query<CouponAllotmentLine>(
      `UPDATE coupon_allotment_lines
       SET status = 'active', unlinked_at = NULL, unlinked_reason = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'unlinked'
       RETURNING *`,
      [id]
    );
    return result.rows[0] || null;
  }

  async findByHeaderIdWithDetails(headerId: string): Promise<CouponAllotmentLineDetail[]> {
    const query = `
      SELECT cal.*, cb.batch_code AS coupon_batch_code, ${VARIETY_LABEL_SELECT} AS variety_label
      FROM coupon_allotment_lines cal
      ${VARIETY_LABEL_JOIN}
      JOIN coupon_batches cb ON cb.coupon_batch_id = cal.coupon_batch_id
      WHERE cal.coupon_allotment_header_id = $1
      ORDER BY cal.created_at ASC
    `;
    const result = await db.query<CouponAllotmentLineDetail>(query, [headerId]);
    return result.rows;
  }

  async findHistory(
    filters: AllotmentHistoryFilters
  ): Promise<{ rows: AllotmentHistoryRow[]; total: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;
    const offset = (page - 1) * limit;
    const conditions: string[] = ['1=1'];
    const values: unknown[] = [];
    let i = 1;

    if (filters.coupon_batch_id) {
      conditions.push(`cal.coupon_batch_id = $${i++}`);
      values.push(filters.coupon_batch_id);
    }
    if (filters.invoice_dispatch_id) {
      conditions.push(`idisp.id = $${i++}`);
      values.push(filters.invoice_dispatch_id);
    }

    const searchClause = buildNormalizedSearchClause(
      [
        'idisp.internal_invoice_number',
        'idisp.party_name',
        'cb.batch_code',
        'cal.from_serial',
        'cal.to_serial',
        'cal.status',
        VARIETY_LABEL_SELECT,
        'p.name',
        'l.lot_number',
      ],
      filters.search,
      i
    );
    if (searchClause.sql) {
      conditions.push(searchClause.sql.replace(/^\s*AND\s*/, ''));
      values.push(...searchClause.params);
      i = searchClause.nextParamIndex;
    }

    const where = conditions.join(' AND ');
    const baseFrom = `
      FROM coupon_allotment_lines cal
      ${VARIETY_LABEL_JOIN}
      JOIN coupon_allotment_headers cah ON cah.id = cal.coupon_allotment_header_id
      JOIN invoice_dispatches idisp ON idisp.id = cah.invoice_dispatch_id
      JOIN coupon_batches cb ON cb.coupon_batch_id = cal.coupon_batch_id
      WHERE ${where}
    `;

    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count ${baseFrom}`,
      values
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    values.push(limit, offset);
    const result = await db.query<AllotmentHistoryRow>(
      `
      SELECT
        cal.id AS coupon_allotment_line_id,
        cal.created_at,
        idisp.id AS invoice_dispatch_id,
        idisp.internal_invoice_number,
        TO_CHAR(idisp.dispatch_date, 'YYYY-MM-DD') AS dispatch_date,
        idisp.party_name,
        ${VARIETY_LABEL_SELECT} AS variety_label,
        cal.coupon_batch_id,
        cb.batch_code AS coupon_batch_code,
        cal.face_value_paise,
        cal.coupons_required,
        cal.coupons_allotted,
        cal.from_serial,
        cal.to_serial,
        cal.status,
        cal.unlinked_at,
        cal.unlinked_reason
      ${baseFrom}
      ORDER BY cal.created_at DESC
      LIMIT $${i++} OFFSET $${i}
      `,
      values
    );
    return { rows: result.rows, total };
  }
}

export const couponAllotmentLineDAO = new CouponAllotmentLineDAO();
