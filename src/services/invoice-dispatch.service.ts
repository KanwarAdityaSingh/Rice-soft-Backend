import { db } from '../database/connection';
import { PoolClient } from 'pg';
import { invoiceDispatchDAO } from '../dao/invoice-dispatch.dao';
import { invoiceDispatchLineDAO } from '../dao/invoice-dispatch-line.dao';
import { invoiceDispatchAllocationDAO } from '../dao/invoice-dispatch-allocation.dao';
import { invoiceNumberSequenceDAO } from '../dao/invoice-number-sequence.dao';
import { salesSaudaLineDAO } from '../dao/sales-sauda-line.dao';
import { salesPartyDAO } from '../dao/sales-party.dao';
import { packagingDAO } from '../dao/packaging.dao';
import { inventoryLedgerDAO } from '../dao/inventory-ledger.dao';
import { eInvoiceDAO } from '../dao/e-invoice.dao';
import { eWayBillDAO } from '../dao/e-way-bill.dao';
import { godownDAO } from '../dao/godown.dao';
import { godownService } from './godown.service';
import {
  getAllocatedBySaudaLineId,
  hasPositiveRemaining,
  qtyExceedsRemaining,
} from './sales-sauda-fulfillment';
import { financialYearFromDate } from '../constants/financial-year';
import {
  buildInvoiceSeriesKey,
  formatInternalInvoiceNumber,
  invoiceStateAlphaFromGstin,
  parseInternalInvoiceNumber,
  INVOICE_DOCUMENT_TYPE_BOS,
} from '../constants/invoice-number-series';
import { BadRequestError, NotFoundError, ValidationError, ConflictError } from '../utils/errors';
import type { Address } from '../models/vendor.model';
import type { SalesSaudaLine } from '../models/sales-sauda-line.model';
import { salesmanCommissionLedgerService } from './salesman-commission-ledger.service';
import type { InvoiceDispatch } from '../models/invoice-dispatch.model';
import type { InvoiceDispatchLine } from '../models/invoice-dispatch-line.model';

function formatPartyAddress(addr: Address | undefined): string {
  if (!addr) return '';
  const parts = [addr.street, addr.city, addr.state, addr.pincode, addr.country].filter(Boolean);
  return parts.join(', ');
}

export class InvoiceDispatchService {
  /**
   * Credit FGI at destination godown (godown transfer).
   * batch_id may be null (link later); packaging_id is still required for a new FGI row.
   */
  private async creditDestinationFgi(
    client: PoolClient,
    params: {
      toGodownId: string;
      fromGodownId: string;
      productId: string;
      packagingId: string | null;
      batchId: string | null;
      quantityKg: number;
      packetCountDelta: number;
      dispatchId: string;
      userId?: string;
    }
  ): Promise<void> {
    const { toGodownId, productId, batchId, quantityKg, packetCountDelta, dispatchId, userId } =
      params;
    if (quantityKg <= 0) return;

    let packagingId = params.packagingId;
    // packaging_id is still NOT NULL on FGI — take from line, else from any matching source row
    if (!packagingId) {
      const pkgLookup = await client.query<{ packaging_id: string }>(
        `SELECT packaging_id
         FROM finished_goods_inventory
         WHERE product_id = $1
           AND packaging_id IS NOT NULL
           AND (godown_id = $2 OR godown_id = $3)
         ORDER BY CASE WHEN godown_id = $2 THEN 0 ELSE 1 END, created_at ASC
         LIMIT 1`,
        [productId, params.fromGodownId, toGodownId]
      );
      packagingId = pkgLookup.rows[0]?.packaging_id ?? null;
    }
    if (!packagingId) {
      throw new ValidationError(
        `Cannot credit destination stock for product ${productId}: packaging_id is required (set on the transfer line)`
      );
    }

    const existing = await client.query<{
      id: string;
      total_weight: string | number;
      no_of_packets: number;
    }>(
      `SELECT id, total_weight, no_of_packets
       FROM finished_goods_inventory
       WHERE godown_id = $1
         AND product_id = $2
         AND packaging_id = $3
         AND batch_id IS NOT DISTINCT FROM $4
       FOR UPDATE`,
      [toGodownId, productId, packagingId, batchId]
    );

    let stockBefore = 0;
    let stockAfter = quantityKg;
    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      stockBefore = parseFloat(row.total_weight.toString());
      stockAfter = stockBefore + quantityKg;
      const newPackets = Math.max(0, (row.no_of_packets ?? 0) + packetCountDelta);
      await client.query(
        `UPDATE finished_goods_inventory
         SET no_of_packets = $1, total_weight = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [newPackets, stockAfter, row.id]
      );
    } else {
      await client.query(
        `INSERT INTO finished_goods_inventory
           (godown_id, product_id, batch_id, packaging_id, no_of_packets, total_weight, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          toGodownId,
          productId,
          batchId,
          packagingId,
          Math.max(0, packetCountDelta),
          quantityKg,
          userId ?? null,
        ]
      );
    }

    await inventoryLedgerDAO.create(
      {
        godown_id: toGodownId,
        product_id: productId,
        quantity_change: quantityKg,
        source_type: 'godown_transfer',
        source_id: dispatchId,
        stock_before: stockBefore,
        stock_after: stockAfter,
        reference_type: 'invoice_dispatch',
        reference_id: dispatchId,
        batch_id: batchId ?? undefined,
        packaging_id: packagingId,
        created_by: userId,
      },
      client
    );
  }

  /**
   * Debit FGI at destination when reversing a godown transfer.
   * Fails if destination no longer has enough stock.
   */
  private async debitDestinationFgi(
    client: PoolClient,
    params: {
      toGodownId: string;
      productId: string;
      packagingId: string | null;
      batchId: string | null;
      quantityKg: number;
      dispatchId: string;
      userId?: string;
    }
  ): Promise<void> {
    const { toGodownId, productId, packagingId, batchId, quantityKg, dispatchId, userId } = params;
    if (quantityKg <= 0) return;

    const existing = await client.query<{
      id: string;
      total_weight: string | number;
      no_of_packets: number;
      packaging_id: string | null;
    }>(
      `SELECT id, total_weight, no_of_packets, packaging_id
       FROM finished_goods_inventory
       WHERE godown_id = $1
         AND product_id = $2
         AND packaging_id IS NOT DISTINCT FROM $3
         AND batch_id IS NOT DISTINCT FROM $4
       FOR UPDATE`,
      [toGodownId, productId, packagingId, batchId]
    );

    if (existing.rows.length === 0) {
      throw new ConflictError(
        `Cannot reverse transfer: no stock at destination for product ${productId}`
      );
    }

    const row = existing.rows[0];
    const stockBefore = parseFloat(row.total_weight.toString());
    if (stockBefore + 1e-6 < quantityKg) {
      throw new ConflictError(
        `Cannot reverse transfer: destination has ${stockBefore} kg but need to reverse ${quantityKg} kg for product ${productId}`
      );
    }

    const stockAfter = Math.max(0, stockBefore - quantityKg);
    let newPackets = row.no_of_packets ?? 0;
    if (row.packaging_id) {
      const pkg = await packagingDAO.findById(row.packaging_id);
      const capacity = pkg ? Number(pkg.holding_capacity) : 1;
      const packetsToRemove = Math.min(newPackets, Math.ceil(quantityKg / capacity));
      newPackets = Math.max(0, newPackets - packetsToRemove);
    }

    await client.query(
      `UPDATE finished_goods_inventory
       SET no_of_packets = $1, total_weight = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [newPackets, stockAfter, row.id]
    );

    await inventoryLedgerDAO.create(
      {
        godown_id: toGodownId,
        product_id: productId,
        quantity_change: -quantityKg,
        source_type: 'godown_transfer',
        source_id: dispatchId,
        stock_before: stockBefore,
        stock_after: stockAfter,
        reference_type: 'invoice_dispatch_cancel',
        reference_id: dispatchId,
        batch_id: batchId ?? undefined,
        packaging_id: packagingId ?? undefined,
        created_by: userId,
      },
      client
    );
  }

  /**
   * Next Bill of Supply internal invoice number for godown GST state + FY.
   * See constants/invoice-number-series.ts for format rules.
   */
  private async allocateInternalInvoiceNumber(
    godownId: string,
    dispatchDate?: string | Date | null,
    client?: PoolClient
  ): Promise<{ internalInvoiceNumber: string; financialYear: string }> {
    const godown = await godownDAO.findById(godownId);
    if (!godown) throw new NotFoundError('Godown not found');
    const gstin = (godown.gst_number || '').trim();
    if (!gstin || gstin.length < 2) {
      throw new BadRequestError(
        'Godown GST number is required to generate internal invoice number'
      );
    }

    let stateAlpha: string;
    try {
      stateAlpha = invoiceStateAlphaFromGstin(gstin);
    } catch (err: any) {
      throw new BadRequestError(err?.message || 'Unsupported godown GST state for invoice numbering');
    }

    const fy = financialYearFromDate(
      dispatchDate != null && String(dispatchDate).trim() !== '' ? dispatchDate : new Date()
    );
    const seriesKey = buildInvoiceSeriesKey(stateAlpha, fy.label);
    const sequence = await invoiceNumberSequenceDAO.allocateNext(
      seriesKey,
      fy.label,
      stateAlpha,
      INVOICE_DOCUMENT_TYPE_BOS,
      client
    );

    return {
      internalInvoiceNumber: formatInternalInvoiceNumber({
        stateAlpha,
        financialYearLabel: fy.label,
        fyStartYear: fy.startYear,
        sequence,
      }),
      financialYear: fy.label,
    };
  }

  private round3(value: number): number {
    return Number(value.toFixed(3));
  }

  /**
   * Resolve kg quantity (and optional packet_count) for a requested dispatch line.
   * packet_count uses the sauda line's packaging.holding_capacity (same rules as sales sauda).
   */
  private async resolveRequestedQuantity(
    saudaLine: SalesSaudaLine,
    req: { quantity?: number; packet_count?: number }
  ): Promise<{ quantity: number; packet_count: number | null }> {
    const hasPacketCount = req.packet_count !== undefined && req.packet_count !== null;
    const hasQuantity = req.quantity !== undefined && req.quantity !== null;

    if (!hasPacketCount && !hasQuantity) {
      throw new ValidationError(
        `quantity or packet_count is required for line ${saudaLine.id}`
      );
    }

    if (hasPacketCount) {
      const packetCount = Number(req.packet_count);
      if (!Number.isInteger(packetCount) || packetCount <= 0) {
        throw new ValidationError(
          `packet_count must be a positive integer for line ${saudaLine.id}`
        );
      }
      if (!saudaLine.packaging_id) {
        throw new ValidationError(
          `packaging_id is required on sauda line ${saudaLine.id} when packet_count is provided`
        );
      }
      const pkg = await packagingDAO.findById(saudaLine.packaging_id);
      if (!pkg) {
        throw new ValidationError(`Packaging not found for sauda line ${saudaLine.id}`);
      }
      const capacity = Number(pkg.holding_capacity);
      if (!(capacity > 0)) {
        throw new ValidationError(
          `Invalid packaging holding_capacity for sauda line ${saudaLine.id}`
        );
      }

      const derivedQuantity = this.round3(packetCount * capacity);
      if (hasQuantity) {
        const delta = Math.abs(Number(req.quantity) - derivedQuantity);
        if (delta > 0.001) {
          throw new ValidationError(
            `Quantity mismatch for line ${saudaLine.id}. Expected ${derivedQuantity} from packet_count and packaging`
          );
        }
      }
      return { quantity: derivedQuantity, packet_count: packetCount };
    }

    const quantity = this.round3(Number(req.quantity));
    if (!(quantity > 0)) {
      throw new ValidationError(`quantity must be > 0 for line ${saudaLine.id}`);
    }
    return { quantity, packet_count: null };
  }

  /**
   * Resolve which sauda lines/qty to put on the dispatch.
   * Omit requestLines → full remaining per line. Otherwise validate subset + qty caps.
   */
  private async resolveDispatchLines(
    saudaLines: SalesSaudaLine[],
    fulfillment: Map<
      string,
      { sales_sauda_line_id: string; ordered: number; allocated: number; returned: number; remaining: number }
    >,
    requestLines?: Array<{ sales_sauda_line_id: string; quantity?: number; packet_count?: number }>
  ): Promise<Array<{ saudaLine: SalesSaudaLine; quantity: number; packet_count: number | null }>> {
    const byId = new Map(saudaLines.map((l) => [l.id, l]));

    if (!requestLines || requestLines.length === 0) {
      const resolved: Array<{
        saudaLine: SalesSaudaLine;
        quantity: number;
        packet_count: number | null;
      }> = [];
      for (const line of saudaLines) {
        const remaining = fulfillment.get(line.id)?.remaining ?? 0;
        if (hasPositiveRemaining(remaining)) {
          resolved.push({ saudaLine: line, quantity: remaining, packet_count: null });
        }
      }
      if (resolved.length === 0) {
        throw new ValidationError('No remaining quantity on this sales sauda to dispatch');
      }
      return resolved;
    }

    const seen = new Set<string>();
    const resolved: Array<{
      saudaLine: SalesSaudaLine;
      quantity: number;
      packet_count: number | null;
    }> = [];
    for (const req of requestLines) {
      if (seen.has(req.sales_sauda_line_id)) {
        throw new ValidationError(`Duplicate sales_sauda_line_id: ${req.sales_sauda_line_id}`);
      }
      seen.add(req.sales_sauda_line_id);

      const saudaLine = byId.get(req.sales_sauda_line_id);
      if (!saudaLine) {
        throw new ValidationError(
          `Sales sauda line ${req.sales_sauda_line_id} does not belong to this sauda`
        );
      }

      const { quantity, packet_count } = await this.resolveRequestedQuantity(saudaLine, req);

      const remaining = fulfillment.get(saudaLine.id)?.remaining ?? 0;
      if (qtyExceedsRemaining(quantity, remaining)) {
        throw new ValidationError(
          `quantity ${quantity} exceeds remaining ${remaining} for line ${req.sales_sauda_line_id}`
        );
      }

      resolved.push({ saudaLine, quantity, packet_count });
    }

    return resolved;
  }

  async list(
    salesSaudaId?: string,
    status?: 'draft' | 'confirmed' | 'cancelled',
    godownId?: string,
    financialYear?: string
  ) {
    return invoiceDispatchDAO.findAll(salesSaudaId, status, godownId, financialYear);
  }

  async getById(id: string) {
    const dispatch = await invoiceDispatchDAO.findById(id);
    if (!dispatch) throw new NotFoundError('Invoice dispatch not found');
    const lines = await invoiceDispatchLineDAO.findByInvoiceDispatchId(id);
    return { ...dispatch, lines };
  }

  async create(
    data: {
      sales_sauda_id: string;
      godown_id: string;
      /** Optional; for transfers must match sauda.to_godown_id if sent */
      to_godown_id?: string | null;
      dispatch_date?: string;
      transporter_id?: string;
      vehicle_id?: string;
      lr_number?: string | null;
      transportation_cost?: number | null;
      distance_km?: number;
      route_description?: string;
      usp?: string | null;
      lines?: Array<{
        sales_sauda_line_id: string;
        quantity?: number;
        packet_count?: number;
      }>;
    },
    userId?: string
  ) {
    await godownService.assertActive(data.godown_id);

    let dispatchId: string;
    try {
      dispatchId = await db.transaction(async (client: PoolClient) => {
        // Serialize concurrent creates against the same sauda
        const locked = await client.query<{
          id: string;
          status: string;
          sales_party_id: string;
          movement_type: string;
          from_godown_id: string | null;
          to_godown_id: string | null;
        }>(
          `SELECT id, status, sales_party_id, movement_type, from_godown_id, to_godown_id
           FROM sales_saudas WHERE id = $1 FOR UPDATE`,
          [data.sales_sauda_id]
        );
        if (locked.rows.length === 0) throw new NotFoundError('Sales sauda not found');
        const sauda = locked.rows[0];
        if (sauda.status !== 'order') {
          throw new ValidationError('Sales sauda must be finalized (order) before creating dispatch');
        }

        let toGodownId: string | null = null;
        if (sauda.movement_type === 'godown_transfer') {
          if (!sauda.from_godown_id || !sauda.to_godown_id) {
            throw new ValidationError('Godown transfer sauda is missing from/to godown');
          }
          if (data.godown_id !== sauda.from_godown_id) {
            throw new ValidationError(
              `Dispatch godown_id must match transfer from_godown_id (${sauda.from_godown_id})`
            );
          }
          if (
            data.to_godown_id != null &&
            data.to_godown_id !== '' &&
            data.to_godown_id !== sauda.to_godown_id
          ) {
            throw new ValidationError(
              `to_godown_id must match transfer to_godown_id (${sauda.to_godown_id})`
            );
          }
          await godownService.assertActive(sauda.to_godown_id);
          toGodownId = sauda.to_godown_id;
        } else if (data.to_godown_id != null && data.to_godown_id !== '') {
          throw new ValidationError('to_godown_id is only allowed for godown_transfer saudas');
        }

        const salesParty = await salesPartyDAO.findById(sauda.sales_party_id);
        if (!salesParty) throw new NotFoundError('Sales party not found');

        const saudaLines = await salesSaudaLineDAO.findBySalesSaudaId(data.sales_sauda_id, client);
        const fulfillment = await getAllocatedBySaudaLineId(data.sales_sauda_id, client);
        const resolvedLines = await this.resolveDispatchLines(
          saudaLines,
          fulfillment,
          data.lines
        );

        const party_name = salesParty.business_name;
        const party_address = formatPartyAddress(salesParty.address);
        const party_gst_number = salesParty.business_details?.gst_number ?? null;
        const party_pan_number = salesParty.business_details?.pan_number ?? null;

        const { internalInvoiceNumber, financialYear } = await this.allocateInternalInvoiceNumber(
          data.godown_id,
          data.dispatch_date,
          client
        );

        const dispatch = await invoiceDispatchDAO.create(
          {
            sales_sauda_id: data.sales_sauda_id,
            godown_id: data.godown_id,
            to_godown_id: toGodownId,
            internal_invoice_number: internalInvoiceNumber,
            dispatch_date: data.dispatch_date,
            financial_year: financialYear,
            party_name,
            party_address,
            party_gst_number,
            party_pan_number,
            transporter_id: data.transporter_id,
            vehicle_id: data.vehicle_id,
            lr_number: data.lr_number,
            transportation_cost: data.transportation_cost,
            distance_km: data.distance_km,
            route_description: data.route_description,
            usp: data.usp,
            created_by: userId,
          },
          client
        );

        for (const { saudaLine, quantity, packet_count } of resolvedLines) {
          const rate = parseFloat(saudaLine.rate.toString());
          const amount = Math.round(quantity * rate * 100) / 100;
          await invoiceDispatchLineDAO.create(
            {
              invoice_dispatch_id: dispatch.id,
              sales_sauda_line_id: saudaLine.id,
              product_id: saudaLine.product_id,
              packaging_id: saudaLine.packaging_id,
              packet_count,
              quantity,
              quantity_unit: saudaLine.quantity_unit,
              rate,
              amount,
            },
            client
          );
        }

        return dispatch.id;
      });
    } catch (err: any) {
      if (err?.code === '23505') {
        throw new ConflictError('Invoice number already exists for this financial year');
      }
      throw err;
    }

    return this.getById(dispatchId);
  }

  /**
   * Update metadata/transport fields for any status (draft, confirmed, cancelled).
   * Sauda, godown, invoice number, status, and lines stay locked — no inventory impact.
   */
  async update(
    id: string,
    data: {
      dispatch_date?: string | null;
      transporter_id?: string | null;
      vehicle_id?: string | null;
      lr_number?: string | null;
      transportation_cost?: number | null;
      distance_km?: number | null;
      route_description?: string | null;
      usp?: string | null;
    },
    userId?: string
  ) {
    const dispatch = await invoiceDispatchDAO.findById(id);
    if (!dispatch) throw new NotFoundError('Invoice dispatch not found');

    const updated = await invoiceDispatchDAO.update(id, {
      ...data,
      updated_by: userId,
    });
    if (!updated) throw new NotFoundError('Invoice dispatch not found');
    return this.getById(id);
  }

  /**
   * Delete a dispatch (any status).
   * - Only the latest invoice in its series (tip) can be deleted; newer ones must go first.
   * - Blocked when credit notes, e-invoice, or e-way bill exist.
   * - Confirmed: reverse inventory then hard delete.
   * - On success, series counter decrements so the next create reuses this number.
   */
  async delete(id: string, userId?: string) {
    const dispatch = await invoiceDispatchDAO.findById(id);
    if (!dispatch) throw new NotFoundError('Invoice dispatch not found');

    if (
      dispatch.status !== 'draft' &&
      dispatch.status !== 'confirmed' &&
      dispatch.status !== 'cancelled'
    ) {
      throw new ConflictError(`Cannot delete invoice dispatch in status '${dispatch.status}'`);
    }

    await this.assertDispatchHardDeletable(id);

    let parsed: ReturnType<typeof parseInternalInvoiceNumber>;
    try {
      parsed = parseInternalInvoiceNumber(dispatch.internal_invoice_number);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unrecognized invoice number';
      throw new ConflictError(message);
    }

    const seriesKey = buildInvoiceSeriesKey(parsed.stateAlpha, dispatch.financial_year);
    const lines =
      dispatch.status === 'confirmed'
        ? await invoiceDispatchLineDAO.findByInvoiceDispatchId(id)
        : [];

    await db.transaction(async (client: PoolClient) => {
      let tip = await invoiceNumberSequenceDAO.lockAndGetLastValue(
        seriesKey,
        dispatch.financial_year,
        parsed.stateAlpha,
        INVOICE_DOCUMENT_TYPE_BOS,
        client
      );

      // Repair orphan tip from older gap-deletes (counter ahead of existing invoices)
      const maxExisting = await this.maxSequenceInSeries(
        client,
        dispatch.financial_year,
        parsed.stateAlpha
      );
      if (maxExisting < tip) {
        await client.query(
          `UPDATE invoice_number_sequences
           SET last_value = $1, updated_at = CURRENT_TIMESTAMP
           WHERE series_key = $2`,
          [maxExisting, seriesKey]
        );
        tip = maxExisting;
      }

      if (tip !== parsed.sequence) {
        throw new ConflictError(
          `Only the latest invoice in the series can be deleted. ` +
            `"${dispatch.internal_invoice_number}" is sequence ${parsed.sequence}, ` +
            `but the series tip is ${tip}. Delete newer invoices (sequence ${tip} down to ${parsed.sequence + 1}) first.`
        );
      }

      if (dispatch.status === 'confirmed') {
        await this.reverseConfirmedDispatchInventory(client, dispatch, lines, userId);
      }

      const result = await client.query('DELETE FROM invoice_dispatches WHERE id = $1', [id]);
      if ((result.rowCount ?? 0) === 0) {
        throw new NotFoundError('Invoice dispatch not found');
      }

      const released = await invoiceNumberSequenceDAO.releaseTip(
        seriesKey,
        parsed.sequence,
        client
      );
      if (!released) {
        throw new ConflictError(
          'Invoice series tip changed concurrently; retry delete of the current latest invoice'
        );
      }
    });
  }

  /** Highest sequence still present for a state series within a financial year. */
  private async maxSequenceInSeries(
    client: PoolClient,
    financialYear: string,
    stateAlpha: string
  ): Promise<number> {
    const rows = await client.query<{ internal_invoice_number: string }>(
      `SELECT internal_invoice_number FROM invoice_dispatches WHERE financial_year = $1`,
      [financialYear]
    );
    let max = 0;
    for (const row of rows.rows) {
      try {
        const p = parseInternalInvoiceNumber(row.internal_invoice_number);
        if (p.stateAlpha === stateAlpha && p.sequence > max) {
          max = p.sequence;
        }
      } catch {
        // skip unrecognized numbers
      }
    }
    return max;
  }

  /** Credit notes, e-invoices, and e-way bills block hard delete. */
  private async assertDispatchHardDeletable(id: string): Promise<void> {
    const cnCount = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM credit_notes WHERE invoice_dispatch_id = $1`,
      [id]
    );
    if (parseInt(cnCount.rows[0]?.count ?? '0', 10) > 0) {
      throw new ConflictError(
        'Cannot delete invoice dispatch that has credit notes; delete the credit notes first'
      );
    }

    const eInvoice = await eInvoiceDAO.findByInvoiceDispatchId(id);
    if (eInvoice) {
      throw new ConflictError(
        'Cannot delete invoice dispatch that has an e-invoice; cancel/remove the e-invoice first'
      );
    }

    const eWayBills = await eWayBillDAO.findByInvoiceDispatchId(id);
    if (eWayBills.length > 0) {
      throw new ConflictError(
        'Cannot delete invoice dispatch that has an e-way bill; cancel/remove the e-way bill first'
      );
    }
  }

  /**
   * Reverse inventory effects of a confirmed dispatch:
   * - godown transfer: debit destination credits, then restore source from allocations
   * - sale: restore source FGI from allocations
   */
  private async reverseConfirmedDispatchInventory(
    client: PoolClient,
    dispatch: InvoiceDispatch,
    lines: InvoiceDispatchLine[],
    userId?: string
  ): Promise<void> {
    if (dispatch.to_godown_id) {
      const destCredits = await client.query<{
        product_id: string;
        packaging_id: string | null;
        batch_id: string | null;
        quantity_change: string | number;
      }>(
        `SELECT product_id, packaging_id, batch_id, quantity_change
         FROM inventory_ledger
         WHERE source_type = 'godown_transfer'
           AND source_id = $1
           AND godown_id = $2
           AND quantity_change > 0
           AND COALESCE(reference_type, '') <> 'invoice_dispatch_cancel'
         ORDER BY created_at ASC`,
        [dispatch.id, dispatch.to_godown_id]
      );

      for (const credit of destCredits.rows) {
        await this.debitDestinationFgi(client, {
          toGodownId: dispatch.to_godown_id,
          productId: credit.product_id,
          packagingId: credit.packaging_id,
          batchId: credit.batch_id,
          quantityKg: parseFloat(credit.quantity_change.toString()),
          dispatchId: dispatch.id,
          userId,
        });
      }

      if (destCredits.rows.length === 0) {
        for (const line of lines) {
          const qty = line.quantity_unit === 'kg' ? parseFloat(line.quantity.toString()) : 0;
          if (qty <= 0) continue;
          await this.debitDestinationFgi(client, {
            toGodownId: dispatch.to_godown_id,
            productId: line.product_id,
            packagingId: line.packaging_id,
            batchId: null,
            quantityKg: qty,
            dispatchId: dispatch.id,
            userId,
          });
        }
      }
    }

    const allocations = await invoiceDispatchAllocationDAO.findByInvoiceDispatchId(
      dispatch.id,
      client
    );
    for (const alloc of allocations) {
      const addBack = parseFloat(alloc.quantity_deducted.toString());
      if (addBack <= 0) continue;

      const fgi = await client.query<{
        id: string;
        product_id: string;
        batch_id: string | null;
        packaging_id: string | null;
        total_weight: string | number;
        no_of_packets: number;
      }>(
        `SELECT id, product_id, batch_id, packaging_id, total_weight, no_of_packets
         FROM finished_goods_inventory WHERE id = $1 FOR UPDATE`,
        [alloc.finished_goods_inventory_id]
      );
      if (fgi.rows.length === 0) {
        throw new ConflictError(
          `Cannot reverse dispatch: source FGI row ${alloc.finished_goods_inventory_id} not found`
        );
      }

      const row = fgi.rows[0];
      const stockBefore = parseFloat(row.total_weight.toString());
      const stockAfter = stockBefore + addBack;
      let newPackets = row.no_of_packets ?? 0;
      if (row.packaging_id) {
        const pkg = await packagingDAO.findById(row.packaging_id);
        const capacity = pkg ? Number(pkg.holding_capacity) : 1;
        newPackets = newPackets + Math.ceil(addBack / capacity);
      }

      await client.query(
        `UPDATE finished_goods_inventory
         SET no_of_packets = $1, total_weight = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [newPackets, stockAfter, row.id]
      );

      await inventoryLedgerDAO.create(
        {
          godown_id: dispatch.godown_id,
          product_id: row.product_id,
          quantity_change: addBack,
          source_type: 'sales_dispatch',
          source_id: dispatch.id,
          stock_before: stockBefore,
          stock_after: stockAfter,
          reference_type: 'invoice_dispatch_cancel',
          reference_id: dispatch.id,
          batch_id: row.batch_id ?? undefined,
          packaging_id: row.packaging_id ?? undefined,
          created_by: userId,
        },
        client
      );
    }
  }

  async confirm(id: string, userId?: string) {
    const dispatch = await invoiceDispatchDAO.findById(id);
    if (!dispatch) throw new NotFoundError('Invoice dispatch not found');
    if (dispatch.status === 'confirmed') {
      return this.getById(id);
    }

    const lines = await invoiceDispatchLineDAO.findByInvoiceDispatchId(id);
    if (lines.length === 0) throw new ValidationError('Invoice dispatch has no lines');

    const sauda = await clientQuerySaudaMovement(dispatch.sales_sauda_id);
    const isTransfer = sauda?.movement_type === 'godown_transfer';
    if (isTransfer && !dispatch.to_godown_id) {
      throw new ValidationError(
        'Godown transfer dispatch is missing to_godown_id; cannot confirm without destination'
      );
    }

    await db.transaction(async (client: PoolClient) => {
      for (const line of lines) {
        const requiredKg = line.quantity_unit === 'kg' ? line.quantity : 0;
        if (requiredKg <= 0) continue;

        // Lock FGI rows for this product (and selected packaging when set) in FIFO order
        const usePackaging = line.packaging_id != null;
        const lockParams = usePackaging
          ? [dispatch.godown_id, line.product_id, line.packaging_id]
          : [dispatch.godown_id, line.product_id];
        const locked = await client.query(
          `SELECT id, godown_id, product_id, batch_id, packaging_id, no_of_packets, total_weight
           FROM finished_goods_inventory
           WHERE godown_id = $1 AND product_id = $2 ${usePackaging ? 'AND packaging_id = $3' : ''} AND total_weight > 0
           ORDER BY created_at ASC
           FOR UPDATE`,
          lockParams
        );

        // Deduct available FGI when present; confirm proceeds even if stock is short/missing.
        let remaining = requiredKg;
        let deductedTotal = 0;
        for (const row of locked.rows) {
          if (remaining <= 0) break;
          const avail = parseFloat(row.total_weight);
          if (avail <= 0) continue;
          const deduct = Math.min(avail, remaining);
          remaining -= deduct;
          deductedTotal += deduct;

          const stockBefore = avail;
          const newWeight = Math.max(0, avail - deduct);
          let packetsToRemove = 0;
          let newPackets = row.no_of_packets;
          if (row.packaging_id) {
            const pkg = await packagingDAO.findById(row.packaging_id);
            const capacity = pkg ? Number(pkg.holding_capacity) : 1;
            packetsToRemove = Math.min(row.no_of_packets, Math.ceil(deduct / capacity));
            newPackets = Math.max(0, row.no_of_packets - packetsToRemove);
          }
          // After migration 098, total_weight and no_of_packets allow 0 (row fully consumed)
          await client.query(
            `UPDATE finished_goods_inventory SET no_of_packets = $1, total_weight = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
            [newPackets, newWeight, row.id]
          );

          await invoiceDispatchAllocationDAO.create(
            {
              invoice_dispatch_id: id,
              invoice_dispatch_line_id: line.id,
              finished_goods_inventory_id: row.id,
              quantity_deducted: deduct,
            },
            client
          );

          await inventoryLedgerDAO.create(
            {
              product_id: line.product_id,
              godown_id: dispatch.godown_id,
              quantity_change: -deduct,
              source_type: 'sales_dispatch',
              source_id: id,
              stock_before: stockBefore,
              stock_after: newWeight,
              reference_type: 'invoice_dispatch',
              reference_id: id,
              batch_id: row.batch_id,
              packaging_id: row.packaging_id,
              created_by: userId,
            },
            client
          );

          // Mirror deducted stock into destination godown (same batch/packaging)
          if (dispatch.to_godown_id) {
            await this.creditDestinationFgi(client, {
              toGodownId: dispatch.to_godown_id,
              fromGodownId: dispatch.godown_id,
              productId: line.product_id,
              packagingId: row.packaging_id,
              batchId: row.batch_id,
              quantityKg: deduct,
              packetCountDelta: packetsToRemove,
              dispatchId: id,
              userId,
            });
          }
        }

        // Credit any shortfall at destination so dispatched qty still arrives (no stock check v1)
        if (dispatch.to_godown_id && deductedTotal < requiredKg) {
          const shortfall = requiredKg - deductedTotal;
          let packetDelta = 0;
          if (line.packaging_id) {
            if (line.packet_count != null && deductedTotal === 0) {
              packetDelta = line.packet_count;
            } else if (line.packet_count != null) {
              packetDelta = Math.ceil(line.packet_count * (shortfall / requiredKg));
            } else {
              const pkg = await packagingDAO.findById(line.packaging_id);
              const capacity = pkg ? Number(pkg.holding_capacity) : 1;
              packetDelta = Math.ceil(shortfall / capacity);
            }
          }
          await this.creditDestinationFgi(client, {
            toGodownId: dispatch.to_godown_id,
            fromGodownId: dispatch.godown_id,
            productId: line.product_id,
            packagingId: line.packaging_id,
            batchId: null,
            quantityKg: shortfall,
            packetCountDelta: packetDelta,
            dispatchId: id,
            userId,
          });
        }
      }

      await client.query(
        `UPDATE invoice_dispatches SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP, updated_by = $1 WHERE id = $2`,
        [userId ?? null, id]
      );

      // Accrue salesman commission from sauda snapshot (sale only; no-op for transfers / no config)
      await salesmanCommissionLedgerService.accrueOnDispatchConfirm(id, userId, client);
    });

    return this.getById(id);
  }

  /**
   * Reverse a confirmed godown-transfer dispatch:
   * - debit destination FGI (fails if stock was already used)
   * - restore source FGI from allocations
   * - status → cancelled (frees sauda remaining qty)
   *
   * For sales dispatches, use DELETE instead (reverses stock and removes the row).
   */
  async cancel(id: string, userId?: string) {
    const dispatch = await invoiceDispatchDAO.findById(id);
    if (!dispatch) throw new NotFoundError('Invoice dispatch not found');

    if (dispatch.status === 'cancelled') {
      return this.getById(id);
    }
    if (dispatch.status === 'draft') {
      throw new ConflictError('Draft dispatches should be deleted, not cancelled');
    }
    if (dispatch.status !== 'confirmed') {
      throw new ConflictError('Only confirmed invoice dispatches can be cancelled');
    }
    if (!dispatch.to_godown_id) {
      throw new ConflictError(
        'Only godown-transfer dispatches (with to_godown_id) can be reversed via cancel; use delete for sales dispatches'
      );
    }

    const lines = await invoiceDispatchLineDAO.findByInvoiceDispatchId(id);

    await db.transaction(async (client: PoolClient) => {
      await this.reverseConfirmedDispatchInventory(client, dispatch, lines, userId);
      await client.query(
        `UPDATE invoice_dispatches
         SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP, updated_by = $1
         WHERE id = $2`,
        [userId ?? null, id]
      );
    });

    return this.getById(id);
  }
}

async function clientQuerySaudaMovement(salesSaudaId: string): Promise<{
  movement_type: string;
} | null> {
  const result = await db.query<{ movement_type: string }>(
    `SELECT movement_type FROM sales_saudas WHERE id = $1`,
    [salesSaudaId]
  );
  return result.rows[0] || null;
}

export const invoiceDispatchService = new InvoiceDispatchService();
