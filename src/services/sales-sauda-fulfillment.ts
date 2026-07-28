import { PoolClient } from 'pg';
import { db } from '../database/connection';
import { salesSaudaLineDAO } from '../dao/sales-sauda-line.dao';
import type { SalesSaudaLine } from '../models/sales-sauda-line.model';

/** Qty comparison epsilon for DECIMAL quantities */
export const QTY_EPSILON = 1e-6;

export interface SaudaLineFulfillment {
  sales_sauda_line_id: string;
  ordered: number;
  allocated: number;
  returned: number;
  remaining: number;
}

export type SalesSaudaLineWithFulfillment = SalesSaudaLine & {
  ordered: number;
  allocated: number;
  returned: number;
  remaining: number;
};

interface FulfillmentRow {
  sales_sauda_line_id: string;
  ordered: string | number;
  allocated: string | number;
  returned: string | number;
  remaining: string | number;
}

function toNum(v: string | number): number {
  return typeof v === 'number' ? v : parseFloat(v);
}

/**
 * Per-line fulfillment for a sales sauda.
 * remaining = ordered - allocated(draft+confirmed) + returned(confirmed credit notes)
 */
export async function getAllocatedBySaudaLineId(
  salesSaudaId: string,
  client?: PoolClient
): Promise<Map<string, SaudaLineFulfillment>> {
  const query = `
    WITH sauda_lines AS (
      SELECT id, quantity
      FROM sales_sauda_lines
      WHERE sales_sauda_id = $1
    ),
    allocated AS (
      SELECT idl.sales_sauda_line_id,
             COALESCE(SUM(idl.quantity), 0) AS allocated
      FROM invoice_dispatch_lines idl
      INNER JOIN invoice_dispatches id ON id.id = idl.invoice_dispatch_id
      INNER JOIN sales_sauda_lines ssl ON ssl.id = idl.sales_sauda_line_id
      WHERE ssl.sales_sauda_id = $1
        AND id.status IN ('draft', 'confirmed')
        AND idl.sales_sauda_line_id IS NOT NULL
      GROUP BY idl.sales_sauda_line_id
    ),
    returned AS (
      SELECT idl.sales_sauda_line_id,
             COALESCE(SUM(cnl.quantity_returned), 0) AS returned
      FROM credit_note_lines cnl
      INNER JOIN credit_notes cn ON cn.id = cnl.credit_note_id
      INNER JOIN invoice_dispatch_lines idl ON idl.id = cnl.invoice_dispatch_line_id
      INNER JOIN sales_sauda_lines ssl ON ssl.id = idl.sales_sauda_line_id
      WHERE ssl.sales_sauda_id = $1
        AND cn.status = 'confirmed'
        AND idl.sales_sauda_line_id IS NOT NULL
      GROUP BY idl.sales_sauda_line_id
    )
    SELECT
      sl.id AS sales_sauda_line_id,
      sl.quantity AS ordered,
      COALESCE(a.allocated, 0) AS allocated,
      COALESCE(r.returned, 0) AS returned,
      sl.quantity - COALESCE(a.allocated, 0) + COALESCE(r.returned, 0) AS remaining
    FROM sauda_lines sl
    LEFT JOIN allocated a ON a.sales_sauda_line_id = sl.id
    LEFT JOIN returned r ON r.sales_sauda_line_id = sl.id
  `;

  const result = client
    ? await client.query<FulfillmentRow>(query, [salesSaudaId])
    : await db.query<FulfillmentRow>(query, [salesSaudaId]);

  const map = new Map<string, SaudaLineFulfillment>();
  for (const row of result.rows) {
    const ordered = toNum(row.ordered);
    const allocated = toNum(row.allocated);
    const returned = toNum(row.returned);
    const remaining = Math.max(0, toNum(row.remaining));
    map.set(row.sales_sauda_line_id, {
      sales_sauda_line_id: row.sales_sauda_line_id,
      ordered,
      allocated,
      returned,
      remaining,
    });
  }
  return map;
}

export async function getFulfillmentForSauda(
  salesSaudaId: string,
  client?: PoolClient
): Promise<SalesSaudaLineWithFulfillment[]> {
  const lines = client
    ? await salesSaudaLineDAO.findBySalesSaudaId(salesSaudaId, client)
    : await salesSaudaLineDAO.findBySalesSaudaId(salesSaudaId);
  const fulfillment = await getAllocatedBySaudaLineId(salesSaudaId, client);

  return lines.map((line) => {
    const f = fulfillment.get(line.id);
    const ordered = f?.ordered ?? parseFloat(line.quantity.toString());
    const allocated = f?.allocated ?? 0;
    const returned = f?.returned ?? 0;
    const remaining = f?.remaining ?? ordered;
    return {
      ...line,
      ordered,
      allocated,
      returned,
      remaining,
    };
  });
}

export function qtyExceedsRemaining(requested: number, remaining: number): boolean {
  return requested > remaining + QTY_EPSILON;
}

export function hasPositiveRemaining(remaining: number): boolean {
  return remaining > QTY_EPSILON;
}
