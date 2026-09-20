import { PoolClient } from 'pg';
import { db } from '../database/connection';
import { invoiceDispatchLineDAO } from '../dao/invoice-dispatch-line.dao';
import { salesSaudaLineDAO } from '../dao/sales-sauda-line.dao';
import type { SalesSaudaDiscountType } from '../models/sales-sauda-line.model';
import { QUANTITY_RETURN_SQL_IN } from '../constants/credit-note';
import {
  computeOriginalLineFinal,
  type CreditNoteTaxContext,
} from './credit-note-financials';

export interface DispatchLineEligibility {
  invoice_dispatch_line_id: string;
  product_id: string | null;
  product_alias: string | null;
  lot_id: string | null;
  packaging_id: string | null;
  packet_count: number | null;
  no_of_bags: number | null;
  bag_weight: number | null;
  quantity_unit: string;
  sales_sauda_line_id: string | null;
  invoiced_qty: number;
  invoiced_rate: number;
  original_final: number;
  credited_qty: number;
  credited_value: number;
  remaining_qty: number;
  remaining_value: number;
  ctx: CreditNoteTaxContext;
}

function num(value: unknown, fallback = 0): number {
  const n = parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Per-dispatch-line remaining qty (quantity-return CNs) and remaining value (all CNs).
 * Draft + posted reserve; cancelled is ignored. Pass excludeCreditNoteId when editing a draft.
 */
export async function getDispatchLineEligibility(
  invoiceDispatchId: string,
  options?: { excludeCreditNoteId?: string; interState: boolean; client?: PoolClient }
): Promise<Map<string, DispatchLineEligibility>> {
  const interState = options?.interState ?? false;
  const client = options?.client;
  const dispatchLines = await invoiceDispatchLineDAO.findByInvoiceDispatchId(invoiceDispatchId);
  const map = new Map<string, DispatchLineEligibility>();
  if (dispatchLines.length === 0) return map;

  const saudaLineIds = [
    ...new Set(
      dispatchLines
        .map((l) => l.sales_sauda_line_id)
        .filter((id): id is string => !!id)
    ),
  ];
  const saudaLines =
    saudaLineIds.length > 0 ? await salesSaudaLineDAO.findByIds(saudaLineIds) : [];
  const saudaById = new Map(saudaLines.map((l) => [l.id, l]));

  const lineIds = dispatchLines.map((l) => l.id);
  const params: unknown[] = [lineIds];
  let excludeSql = '';
  if (options?.excludeCreditNoteId) {
    params.push(options.excludeCreditNoteId);
    excludeSql = ` AND cn.id <> $2`;
  }

  const sql = `
    SELECT
      cnl.invoice_dispatch_line_id,
      COALESCE(SUM(
        CASE WHEN cn.credit_note_type IN (${QUANTITY_RETURN_SQL_IN})
          THEN COALESCE(cnl.quantity_credited, cnl.quantity_returned)
          ELSE 0
        END
      ), 0)::text AS credited_qty,
      COALESCE(SUM(cnl.final_amount), 0)::text AS credited_value
    FROM credit_note_lines cnl
    JOIN credit_notes cn ON cn.id = cnl.credit_note_id
    WHERE cnl.invoice_dispatch_line_id = ANY($1::uuid[])
      AND cn.status IN ('draft', 'posted')
      ${excludeSql}
    GROUP BY cnl.invoice_dispatch_line_id
  `;
  const result = client
    ? await client.query<{
        invoice_dispatch_line_id: string;
        credited_qty: string;
        credited_value: string;
      }>(sql, params)
    : await db.query<{
        invoice_dispatch_line_id: string;
        credited_qty: string;
        credited_value: string;
      }>(sql, params);
  const credited = new Map(
    result.rows.map((r) => [
      r.invoice_dispatch_line_id,
      { qty: num(r.credited_qty), value: num(r.credited_value) },
    ])
  );

  for (const line of dispatchLines) {
    const saudaLine = line.sales_sauda_line_id
      ? saudaById.get(line.sales_sauda_line_id)
      : undefined;
    const invoiced_qty = num(line.quantity);
    const invoiced_rate = num(line.rate);
    const gstPercent = saudaLine ? num(saudaLine.gst_percent) : 0;
    const discountValue = saudaLine ? num(saudaLine.discount_value) : 0;
    const discountType: SalesSaudaDiscountType =
      saudaLine?.discount_type === 'percentage' ? 'percentage' : 'per_kg';
    const ctx: CreditNoteTaxContext = {
      rate: invoiced_rate,
      gstPercent,
      discountValue,
      discountType,
      interState,
    };
    const original_final = computeOriginalLineFinal(invoiced_qty, ctx);
    const used = credited.get(line.id) ?? { qty: 0, value: 0 };
    map.set(line.id, {
      invoice_dispatch_line_id: line.id,
      product_id: line.product_id,
      product_alias: line.product_alias,
      lot_id: line.lot_id,
      packaging_id: line.packaging_id,
      packet_count: line.packet_count != null ? num(line.packet_count, 0) : null,
      no_of_bags: line.no_of_bags != null ? num(line.no_of_bags, 0) : null,
      bag_weight: line.bag_weight != null ? num(line.bag_weight, 0) : null,
      quantity_unit: line.quantity_unit,
      sales_sauda_line_id: line.sales_sauda_line_id,
      invoiced_qty,
      invoiced_rate,
      original_final,
      credited_qty: used.qty,
      credited_value: used.value,
      remaining_qty: Math.max(0, invoiced_qty - used.qty),
      remaining_value: Math.max(0, original_final - used.value),
      ctx,
    });
  }

  return map;
}
