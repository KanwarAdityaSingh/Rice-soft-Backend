import { PoolClient } from 'pg';
import { db } from '../database/connection';
import {
  CouponAllotmentHeader,
  CouponAllotmentHeaderStatus,
  InvoiceAllotmentSummary,
  InvoiceAllotmentSummaryFilters,
} from '../models/coupon-allotment.model';
import { buildNormalizedSearchClause } from '../utils/search';

/**
 * Per-invoice bag / allotment rollup.
 * Bags = packet_count / no_of_bags minus bags proportional to confirmed credit-note returns.
 * Allotted = sum of active coupon_allotment_lines.coupons_allotted across the invoice's lines.
 */
const INVOICE_ALLOTMENT_SUMMARY_FROM = `
  FROM invoice_dispatches idisp
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(SUM(bags), 0)::int AS coupons_required,
      COALESCE(SUM(allotted), 0)::int AS coupons_allotted,
      COALESCE(SUM(GREATEST(0, bags - allotted)), 0)::int AS outstanding
    FROM (
      SELECT
        idl.id,
        GREATEST(
          0,
          raw_bags - CASE
            WHEN raw_bags <= 0 OR line_qty <= 0 OR qty_credited <= 0 THEN 0
            WHEN qty_credited >= line_qty THEN raw_bags
            ELSE LEAST(raw_bags, ROUND((qty_credited / line_qty) * raw_bags)::int)
          END
        ) AS bags,
        allotted
      FROM (
        SELECT
          idl.id,
          idl.quantity::numeric AS line_qty,
          CASE
            WHEN idl.packet_count IS NOT NULL AND idl.packet_count > 0 THEN idl.packet_count::int
            WHEN idl.no_of_bags IS NOT NULL AND idl.no_of_bags > 0 THEN idl.no_of_bags::int
            ELSE 0
          END AS raw_bags,
          COALESCE((
            SELECT SUM(COALESCE(cnl.quantity_credited, cnl.quantity_returned))::numeric
            FROM credit_note_lines cnl
            JOIN credit_notes cn ON cn.id = cnl.credit_note_id
            WHERE cnl.invoice_dispatch_line_id = idl.id
              AND cn.status = 'posted'
              AND cn.credit_note_type IN (
                'sales_return_full', 'sales_return_partial', 'short_quantity',
                'quality_issue', 'damaged_goods'
              )
          ), 0) AS qty_credited,
          COALESCE((
            SELECT SUM(cal.coupons_allotted)::int
            FROM coupon_allotment_lines cal
            WHERE cal.invoice_dispatch_line_id = idl.id
              AND cal.status = 'active'
          ), 0) AS allotted
        FROM invoice_dispatch_lines idl
        WHERE idl.invoice_dispatch_id = idisp.id
      ) idl
    ) line_stats
  ) totals ON TRUE
`;

const FULFILLMENT_EXPR = `
  CASE
    WHEN COALESCE(totals.coupons_required, 0) > 0
         AND COALESCE(totals.outstanding, 0) = 0 THEN 'fulfilled'
    WHEN COALESCE(totals.coupons_allotted, 0) > 0
         AND COALESCE(totals.outstanding, 0) > 0 THEN 'partial'
    ELSE 'unallotted'
  END
`;

export class CouponAllotmentHeaderDAO {
  async create(
    data: { invoice_dispatch_id: string; created_by?: string | null },
    client?: PoolClient
  ): Promise<CouponAllotmentHeader> {
    const query = `
      INSERT INTO coupon_allotment_headers (invoice_dispatch_id, created_by)
      VALUES ($1, $2)
      RETURNING *
    `;
    const values = [data.invoice_dispatch_id, data.created_by ?? null];
    const result = client
      ? await client.query<CouponAllotmentHeader>(query, values)
      : await db.query<CouponAllotmentHeader>(query, values);
    return result.rows[0];
  }

  async findByInvoiceDispatchId(
    invoiceDispatchId: string,
    client?: PoolClient
  ): Promise<CouponAllotmentHeader | null> {
    const query = `SELECT * FROM coupon_allotment_headers WHERE invoice_dispatch_id = $1`;
    const result = client
      ? await client.query<CouponAllotmentHeader>(query, [invoiceDispatchId])
      : await db.query<CouponAllotmentHeader>(query, [invoiceDispatchId]);
    return result.rows[0] || null;
  }

  /** Row-locks the header so concurrent confirms/unlinks against the same invoice serialize. */
  async findByInvoiceDispatchIdForUpdate(
    invoiceDispatchId: string,
    client: PoolClient
  ): Promise<CouponAllotmentHeader | null> {
    const result = await client.query<CouponAllotmentHeader>(
      `SELECT * FROM coupon_allotment_headers WHERE invoice_dispatch_id = $1 FOR UPDATE`,
      [invoiceDispatchId]
    );
    return result.rows[0] || null;
  }

  async findById(id: string, client?: PoolClient): Promise<CouponAllotmentHeader | null> {
    const query = `SELECT * FROM coupon_allotment_headers WHERE id = $1`;
    const result = client
      ? await client.query<CouponAllotmentHeader>(query, [id])
      : await db.query<CouponAllotmentHeader>(query, [id]);
    return result.rows[0] || null;
  }

  async updateStatus(
    id: string,
    status: CouponAllotmentHeaderStatus,
    client: PoolClient
  ): Promise<CouponAllotmentHeader | null> {
    const result = await client.query<CouponAllotmentHeader>(
      `UPDATE coupon_allotment_headers
       SET status = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id, status]
    );
    return result.rows[0] || null;
  }

  /**
   * Paginated confirmed sales invoices with rolled-up coupon required / allotted / outstanding.
   * Replaces N+1 getAllotmentCandidates calls on the allotment worklist tab.
   */
  async findInvoiceAllotmentSummaries(
    filters: InvoiceAllotmentSummaryFilters
  ): Promise<{ rows: InvoiceAllotmentSummary[]; total: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;
    const offset = (page - 1) * limit;

    const conditions: string[] = [
      `idisp.status = 'confirmed'`,
      // Coupon allotment is for party sales, not godown transfers
      `idisp.to_godown_id IS NULL`,
    ];
    const values: unknown[] = [];
    let i = 1;

    const searchClause = buildNormalizedSearchClause(
      [
        'idisp.serial_number',
        'idisp.internal_invoice_number',
        'idisp.party_name',
        'idisp.party_gst_number',
        'idisp.lr_number',
      ],
      filters.search,
      i
    );
    if (searchClause.sql) {
      conditions.push(searchClause.sql.replace(/^\s*AND\s*/, ''));
      values.push(...searchClause.params);
      i = searchClause.nextParamIndex;
    }

    if (filters.fulfillment) {
      conditions.push(`(${FULFILLMENT_EXPR}) = $${i++}`);
      values.push(filters.fulfillment);
    }

    const where = conditions.join(' AND ');
    const baseFrom = `${INVOICE_ALLOTMENT_SUMMARY_FROM} WHERE ${where}`;

    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count ${baseFrom}`,
      values
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    values.push(limit, offset);
    const result = await db.query<InvoiceAllotmentSummary>(
      `
      SELECT
        idisp.id AS invoice_dispatch_id,
        idisp.serial_number,
        idisp.internal_invoice_number,
        TO_CHAR(idisp.dispatch_date, 'YYYY-MM-DD') AS dispatch_date,
        idisp.party_name,
        idisp.status,
        idisp.godown_id,
        COALESCE(totals.coupons_required, 0) AS coupons_required,
        COALESCE(totals.coupons_allotted, 0) AS coupons_allotted,
        COALESCE(totals.outstanding, 0) AS outstanding,
        (${FULFILLMENT_EXPR}) AS fulfillment
      ${baseFrom}
      ORDER BY idisp.serial_number DESC NULLS LAST, idisp.created_at DESC
      LIMIT $${i++} OFFSET $${i}
      `,
      values
    );

    return { rows: result.rows, total };
  }
}

export const couponAllotmentHeaderDAO = new CouponAllotmentHeaderDAO();
