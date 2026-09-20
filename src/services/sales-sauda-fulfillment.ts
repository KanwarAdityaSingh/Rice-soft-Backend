import { PoolClient } from 'pg';
import { db } from '../database/connection';
import { salesSaudaLineDAO } from '../dao/sales-sauda-line.dao';
import { lotInventoryDAO } from '../dao/lot-inventory.dao';
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
  /** Live lot_inventory.available_quantity when line_type=lot */
  lot_available?: number | null;
};

interface FulfillmentRow {
  sales_sauda_line_id: string;
  sales_sauda_id?: string;
  ordered: string | number;
  allocated: string | number;
  returned: string | number;
  remaining: string | number;
}

function toNum(v: string | number): number {
  return typeof v === 'number' ? v : parseFloat(v);
}

function mapFulfillmentRows(rows: FulfillmentRow[]): Map<string, SaudaLineFulfillment> {
  const map = new Map<string, SaudaLineFulfillment>();
  for (const row of rows) {
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

/**
 * Per-line fulfillment for many sales saudas (one CTE — list/detail share this math).
 * remaining = ordered - allocated(draft+confirmed) + returned(confirmed credit notes)
 */
export async function getAllocatedBySaudaIds(
  salesSaudaIds: string[],
  client?: PoolClient
): Promise<Map<string, SaudaLineFulfillment>> {
  if (salesSaudaIds.length === 0) return new Map();

  const query = `
    WITH sauda_lines AS (
      SELECT id, quantity
      FROM sales_sauda_lines
      WHERE sales_sauda_id = ANY($1::uuid[])
    ),
    allocated AS (
      SELECT idl.sales_sauda_line_id,
             COALESCE(SUM(idl.quantity), 0) AS allocated
      FROM invoice_dispatch_lines idl
      INNER JOIN invoice_dispatches id ON id.id = idl.invoice_dispatch_id
      INNER JOIN sales_sauda_lines ssl ON ssl.id = idl.sales_sauda_line_id
      WHERE ssl.sales_sauda_id = ANY($1::uuid[])
        AND id.status IN ('draft', 'confirmed')
        AND idl.sales_sauda_line_id IS NOT NULL
      GROUP BY idl.sales_sauda_line_id
    ),
    returned AS (
      SELECT idl.sales_sauda_line_id,
             COALESCE(SUM(COALESCE(cnl.quantity_credited, cnl.quantity_returned)), 0) AS returned
      FROM credit_note_lines cnl
      INNER JOIN credit_notes cn ON cn.id = cnl.credit_note_id
      INNER JOIN invoice_dispatch_lines idl ON idl.id = cnl.invoice_dispatch_line_id
      INNER JOIN sales_sauda_lines ssl ON ssl.id = idl.sales_sauda_line_id
      WHERE ssl.sales_sauda_id = ANY($1::uuid[])
        AND cn.status = 'posted'
        AND cn.credit_note_type IN (
          'sales_return_full', 'sales_return_partial', 'short_quantity',
          'quality_issue', 'damaged_goods'
        )
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
    ? await client.query<FulfillmentRow>(query, [salesSaudaIds])
    : await db.query<FulfillmentRow>(query, [salesSaudaIds]);

  return mapFulfillmentRows(result.rows);
}

/**
 * Per-line fulfillment for a sales sauda.
 * remaining = ordered - allocated(draft+confirmed) + returned(confirmed credit notes)
 */
export async function getAllocatedBySaudaLineId(
  salesSaudaId: string,
  client?: PoolClient
): Promise<Map<string, SaudaLineFulfillment>> {
  return getAllocatedBySaudaIds([salesSaudaId], client);
}

async function attachLotAvailability(
  lines: SalesSaudaLineWithFulfillment[]
): Promise<SalesSaudaLineWithFulfillment[]> {
  const lotIds = [
    ...new Set(
      lines
        .filter((l) => l.line_type === 'lot' && l.lot_id)
        .map((l) => l.lot_id!)
    ),
  ];
  if (lotIds.length === 0) {
    return lines.map((l) => ({ ...l, lot_available: null }));
  }
  const availableByLot = new Map<string, number>();
  await Promise.all(
    lotIds.map(async (lotId) => {
      availableByLot.set(lotId, await lotInventoryDAO.getAvailableQuantity(lotId));
    })
  );
  return lines.map((l) => ({
    ...l,
    lot_available:
      l.line_type === 'lot' && l.lot_id ? (availableByLot.get(l.lot_id) ?? 0) : null,
  }));
}

function attachFulfillment(
  lines: SalesSaudaLine[],
  fulfillment: Map<string, SaudaLineFulfillment>
): SalesSaudaLineWithFulfillment[] {
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
      lot_available: null,
    };
  });
}

export async function getFulfillmentForSauda(
  salesSaudaId: string,
  client?: PoolClient
): Promise<SalesSaudaLineWithFulfillment[]> {
  const bySauda = await getFulfillmentForSaudas([salesSaudaId], client);
  return bySauda.get(salesSaudaId) ?? [];
}

/**
 * Batch fulfillment for list endpoints: 1 lines query + 1 allocated/returned CTE.
 * Returns map keyed by sales_sauda_id.
 */
export async function getFulfillmentForSaudas(
  salesSaudaIds: string[],
  client?: PoolClient
): Promise<Map<string, SalesSaudaLineWithFulfillment[]>> {
  const result = new Map<string, SalesSaudaLineWithFulfillment[]>();
  if (salesSaudaIds.length === 0) return result;

  for (const id of salesSaudaIds) {
    result.set(id, []);
  }

  const lines = client
    ? await salesSaudaLineDAO.findBySalesSaudaIds(salesSaudaIds, client)
    : await salesSaudaLineDAO.findBySalesSaudaIds(salesSaudaIds);
  const fulfillment = await getAllocatedBySaudaIds(salesSaudaIds, client);

  const linesBySauda = new Map<string, SalesSaudaLine[]>();
  for (const line of lines) {
    const bucket = linesBySauda.get(line.sales_sauda_id);
    if (bucket) bucket.push(line);
    else linesBySauda.set(line.sales_sauda_id, [line]);
  }

  for (const [saudaId, saudaLines] of linesBySauda) {
    const withFulfillment = attachFulfillment(saudaLines, fulfillment);
    result.set(saudaId, await attachLotAvailability(withFulfillment));
  }

  return result;
}

export function qtyExceedsRemaining(requested: number, remaining: number): boolean {
  return requested > remaining + QTY_EPSILON;
}

export function hasPositiveRemaining(remaining: number): boolean {
  return remaining > QTY_EPSILON;
}

/** has lines AND every line remaining <= 0 */
export function isFullyDispatched(lines: Array<{ remaining: number }>): boolean {
  return lines.length > 0 && lines.every((l) => !hasPositiveRemaining(l.remaining));
}

/** any line remaining > 0 */
export function hasRemainingQuantity(lines: Array<{ remaining: number }>): boolean {
  return lines.some((l) => hasPositiveRemaining(l.remaining));
}
