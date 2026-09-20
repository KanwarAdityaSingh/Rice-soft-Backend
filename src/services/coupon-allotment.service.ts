import { PoolClient } from 'pg';
import { db } from '../database/connection';
import { couponAllotmentHeaderDAO, CouponAllotmentHeaderDAO } from '../dao/coupon-allotment-header.dao';
import { couponAllotmentLineDAO, CouponAllotmentLineDAO } from '../dao/coupon-allotment-line.dao';
import {
  couponAllotmentLineCouponDAO,
  CouponAllotmentLineCouponDAO,
} from '../dao/coupon-allotment-line-coupon.dao';
import { CouponBatchDAO } from '../dao/coupon-batch.dao';
import { invoiceDispatchDAO } from '../dao/invoice-dispatch.dao';
import { invoiceDispatchLineDAO } from '../dao/invoice-dispatch-line.dao';
import { CouponStateMachine } from './coupon-state.machine';
import { BadRequestError, ConflictError, NotFoundError, ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';
import {
  AllotmentCandidateLine,
  AllotmentHistoryFilters,
  AllotmentHistoryRow,
  AllotmentPreviewRangeResult,
  AllotmentPreviewResult,
  ConfirmAllotmentLineRequest,
  CouponAllotmentHeaderWithLines,
  CouponAllotmentLine,
  CouponBatchAllotmentProgress,
  InvoiceAllotmentSummary,
  InvoiceAllotmentSummaryFilters,
  PreviewAllotmentRequest,
  SerialRangeInput,
} from '../models/coupon-allotment.model';
import { Coupon, CouponBatch } from '../models/coupon.model';
import { InvoiceDispatchLine } from '../models/invoice-dispatch-line.model';
import { formatCouponSerial, parseCouponSerialSequence } from '../utils/coupon.helpers';

/** A resolved coupon slice within one batch: either a serial range, or `null` for "next available". */
type ResolvedSliceBounds = { fromSeq: number; toSeq: number } | null;

/** 1 coupon per bag — product lines use packet_count, lot lines use no_of_bags (mutually exclusive). */
function resolveBagCount(line: InvoiceDispatchLine): number | null {
  const raw = line.packet_count ?? line.no_of_bags;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Bags (coupons) to free for a credit-note return, proportional to qty returned / line qty.
 * Full return (≥ line qty) frees every bag on the line; otherwise rounded proportion, clamped.
 */
function bagsToUnlinkForReturn(line: InvoiceDispatchLine, quantityReturned: number): number {
  const bags = resolveBagCount(line);
  if (!bags) return 0;
  const lineQty = Number(line.quantity);
  const returned = Number(quantityReturned);
  if (!Number.isFinite(lineQty) || lineQty <= 0) return 0;
  if (!Number.isFinite(returned) || returned <= 0) return 0;
  if (returned >= lineQty - 1e-6) return bags;
  return Math.min(bags, Math.max(0, Math.round((returned / lineQty) * bags)));
}

/** Bags still on the invoice line after confirmed credit-note returns (for outstanding / re-allot). */
function resolveEffectiveBagCount(
  line: InvoiceDispatchLine,
  quantityCredited: number
): number | null {
  const bags = resolveBagCount(line);
  if (bags == null) return null;
  return Math.max(0, bags - bagsToUnlinkForReturn(line, quantityCredited));
}

export class CouponAllotmentService {
  constructor(
    private headerDAO: CouponAllotmentHeaderDAO = couponAllotmentHeaderDAO,
    private lineDAO: CouponAllotmentLineDAO = couponAllotmentLineDAO,
    private lineCouponDAO: CouponAllotmentLineCouponDAO = couponAllotmentLineCouponDAO,
    private couponBatchDAO = new CouponBatchDAO(),
    private stateMachine = new CouponStateMachine()
  ) {}

  // ---------------------------------------------------------------------
  // Step 1: "Select rice variety" — candidate invoice lines + their progress so far
  // ---------------------------------------------------------------------

  async getAllotmentCandidates(invoiceDispatchId: string): Promise<AllotmentCandidateLine[]> {
    const dispatch = await invoiceDispatchDAO.findById(invoiceDispatchId);
    if (!dispatch) throw new NotFoundError('Invoice dispatch not found');

    const lines = await invoiceDispatchLineDAO.findByInvoiceDispatchId(invoiceDispatchId);
    if (lines.length === 0) return [];

    const productIds = [...new Set(lines.map((l) => l.product_id).filter((id): id is string => !!id))];
    const lotIds = [...new Set(lines.map((l) => l.lot_id).filter((id): id is string => !!id))];
    const [productNames, lotLabels] = await Promise.all([
      this.fetchProductNames(productIds),
      this.fetchLotLabels(lotIds),
    ]);

    const header = await this.headerDAO.findByInvoiceDispatchId(invoiceDispatchId);
    const existingLines = header ? await this.lineDAO.findByHeaderIdWithDetails(header.id) : [];
    const creditedQtyByLineId = await this.fetchConfirmedCreditNoteQtyByDispatchLineIds(
      lines.map((l) => l.id)
    );

    return lines.map((line) => {
      const bags = resolveEffectiveBagCount(line, creditedQtyByLineId.get(line.id) ?? 0);
      const linesForThisLine = existingLines.filter((l) => l.invoice_dispatch_line_id === line.id);
      const alreadyAllotted = linesForThisLine
        .filter((l) => l.status === 'active')
        .reduce((sum, l) => sum + l.coupons_allotted, 0);
      const varietyLabel = line.product_id
        ? productNames.get(line.product_id) ?? 'Unknown product'
        : line.lot_id
          ? lotLabels.get(line.lot_id) ?? 'Unknown lot'
          : 'Unknown';

      return {
        invoice_dispatch_line_id: line.id,
        line_type: line.lot_id ? 'lot' : 'product',
        product_id: line.product_id,
        product_name: line.product_id ? productNames.get(line.product_id) ?? null : null,
        lot_id: line.lot_id,
        lot_number: null,
        variety_label: varietyLabel,
        bags,
        already_allotted: alreadyAllotted,
        outstanding: bags != null ? Math.max(0, bags - alreadyAllotted) : 0,
        active_lines: linesForThisLine,
      };
    });
  }

  private async fetchConfirmedCreditNoteQtyByDispatchLineIds(
    dispatchLineIds: string[]
  ): Promise<Map<string, number>> {
    if (dispatchLineIds.length === 0) return new Map();
    const result = await db.query<{ invoice_dispatch_line_id: string; qty: string }>(
      `SELECT cnl.invoice_dispatch_line_id, COALESCE(SUM(COALESCE(cnl.quantity_credited, cnl.quantity_returned)), 0)::text AS qty
       FROM credit_note_lines cnl
       JOIN credit_notes cn ON cn.id = cnl.credit_note_id
       WHERE cnl.invoice_dispatch_line_id = ANY($1::uuid[])
         AND cn.status = 'posted'
         AND cn.credit_note_type IN (
           'sales_return_full', 'sales_return_partial', 'short_quantity',
           'quality_issue', 'damaged_goods'
         )
       GROUP BY cnl.invoice_dispatch_line_id`,
      [dispatchLineIds]
    );
    return new Map(result.rows.map((r) => [r.invoice_dispatch_line_id, parseFloat(r.qty)]));
  }

  private async fetchProductNames(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const result = await db.query<{ id: string; name: string }>(
      `SELECT id, name FROM products WHERE id = ANY($1::uuid[])`,
      [ids]
    );
    return new Map(result.rows.map((r) => [r.id, r.name]));
  }

  private async fetchLotLabels(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const result = await db.query<{ id: string; lot_number: string; rice_category: string }>(
      `SELECT id, lot_number, rice_category FROM inward_slip_lots WHERE id = ANY($1::uuid[])`,
      [ids]
    );
    return new Map(result.rows.map((r) => [r.id, `Lot ${r.lot_number} (${r.rice_category})`]));
  }

  // ---------------------------------------------------------------------
  // Step 2: "Preview Serial Numbers" — non-locking dry run, no mutation
  // ---------------------------------------------------------------------

  /**
   * Preview what confirming would allot, without locking anything.
   * `next_available` (default): preview the next N printed coupons.
   * `serial_range`: preview one caller-chosen range — useful when the user wants to hand-pick
   * which physical booklet/series goes to which line instead of taking the automatic pick.
   * `serial_ranges`: preview several disjoint ranges at once (e.g. 1-5 and 8-12); the result
   * is the sum across all ranges plus a per-range breakdown so the UI can flag which
   * specific range is short, if any.
   */
  async previewAllotment(request: PreviewAllotmentRequest): Promise<AllotmentPreviewResult> {
    const batch = await this.couponBatchDAO.findById(request.coupon_batch_id);
    if (!batch) throw new NotFoundError('Coupon batch not found');

    if (request.mode === 'serial_ranges') {
      return this.previewSerialRanges(request.coupon_batch_id, request.ranges, batch);
    }

    let rows: Array<{ serial_number: string }>;
    let requestedCount: number;

    if (request.mode === 'serial_range') {
      const { fromSeq, toSeq, span } = this.resolveSerialRangeSeq(request, batch);
      requestedCount = span;
      const result = await db.query<{ serial_number: string }>(
        `SELECT serial_number FROM coupons
         WHERE coupon_batch_id = $1 AND status = 'printed' AND batch_sequence BETWEEN $2 AND $3
         ORDER BY batch_sequence ASC`,
        [request.coupon_batch_id, fromSeq, toSeq]
      );
      rows = result.rows;
    } else {
      requestedCount = request.count;
      const result = await db.query<{ serial_number: string }>(
        `SELECT serial_number FROM coupons
         WHERE coupon_batch_id = $1 AND status = 'printed'
         ORDER BY batch_sequence ASC
         LIMIT $2`,
        [request.coupon_batch_id, requestedCount]
      );
      rows = result.rows;
    }

    return {
      coupon_batch_id: request.coupon_batch_id,
      requested_count: requestedCount,
      available_count: rows.length,
      from_serial: rows[0]?.serial_number ?? null,
      to_serial: rows[rows.length - 1]?.serial_number ?? null,
      shortfall: Math.max(0, requestedCount - rows.length),
    };
  }

  private async previewSerialRanges(
    couponBatchId: string,
    ranges: SerialRangeInput[],
    batch: CouponBatch
  ): Promise<AllotmentPreviewResult> {
    const resolvedRanges = this.resolveNonOverlappingRanges(ranges, batch);
    const rangeResults: AllotmentPreviewRangeResult[] = [];
    let totalRequested = 0;
    let totalAvailable = 0;
    let overallFrom: string | null = null;
    let overallTo: string | null = null;

    for (const range of resolvedRanges) {
      const result = await db.query<{ serial_number: string }>(
        `SELECT serial_number FROM coupons
         WHERE coupon_batch_id = $1 AND status = 'printed' AND batch_sequence BETWEEN $2 AND $3
         ORDER BY batch_sequence ASC`,
        [couponBatchId, range.fromSeq, range.toSeq]
      );
      const rows = result.rows;
      const rangeFrom = rows[0]?.serial_number ?? null;
      const rangeTo = rows[rows.length - 1]?.serial_number ?? null;
      rangeResults.push({
        from_serial: rangeFrom,
        to_serial: rangeTo,
        requested_count: range.span,
        available_count: rows.length,
        shortfall: Math.max(0, range.span - rows.length),
      });
      totalRequested += range.span;
      totalAvailable += rows.length;
      overallFrom = overallFrom ?? rangeFrom;
      overallTo = rangeTo ?? overallTo;
    }

    return {
      coupon_batch_id: couponBatchId,
      requested_count: totalRequested,
      available_count: totalAvailable,
      from_serial: overallFrom,
      to_serial: overallTo,
      shortfall: Math.max(0, totalRequested - totalAvailable),
      ranges: rangeResults,
    };
  }

  /** Parses a `serial_range` selection into batch_sequence bounds; validates ordering. */
  private resolveSerialRangeSeq(
    selection: { from_serial: string; to_serial: string },
    batch: CouponBatch
  ): { fromSeq: number; toSeq: number; span: number } {
    const fromSeq = parseCouponSerialSequence(selection.from_serial, batch.batch_code);
    const toSeq = parseCouponSerialSequence(selection.to_serial, batch.batch_code);
    if (fromSeq == null || toSeq == null) {
      throw new ValidationError(
        `Serial numbers must belong to this batch (${batch.batch_code}-NNNNNN)`
      );
    }
    if (fromSeq > toSeq) {
      throw new ValidationError('from_serial must be less than or equal to to_serial');
    }
    return { fromSeq, toSeq, span: toSeq - fromSeq + 1 };
  }

  /**
   * Resolves a `serial_ranges` array into batch_sequence bounds and rejects overlaps up
   * front (before anything is locked) so the whole request fails clearly instead of silently
   * under-allotting the second range. Returned in the caller's original order — sorting is
   * only used internally for the adjacency check.
   */
  private resolveNonOverlappingRanges(
    ranges: SerialRangeInput[],
    batch: CouponBatch
  ): Array<{ fromSeq: number; toSeq: number; span: number }> {
    const resolved = ranges.map((r) => this.resolveSerialRangeSeq(r, batch));
    const sortedByStart = [...resolved].sort((a, b) => a.fromSeq - b.fromSeq);
    for (let i = 1; i < sortedByStart.length; i++) {
      if (sortedByStart[i].fromSeq <= sortedByStart[i - 1].toSeq) {
        throw new ValidationError(
          `Serial ranges overlap: ${formatCouponSerial(batch.batch_code, sortedByStart[i - 1].fromSeq)}..${formatCouponSerial(batch.batch_code, sortedByStart[i - 1].toSeq)} and ` +
            `${formatCouponSerial(batch.batch_code, sortedByStart[i].fromSeq)}..${formatCouponSerial(batch.batch_code, sortedByStart[i].toSeq)}`
        );
      }
    }
    return resolved;
  }

  // ---------------------------------------------------------------------
  // Step 3: "Confirm Allotment" — one atomic transaction for the whole invoice
  // ---------------------------------------------------------------------

  /**
   * Locks and allots coupons for every requested (invoice line, batch) pair in a single
   * transaction. Partial allotment is allowed per business rule: if a batch has fewer
   * coupons remaining than a line still needs, we take whatever is available and record
   * the shortfall on the line (coupons_allotted < coupons_required) rather than failing
   * the whole confirm — the caller can top up later from the same or a different batch.
   */
  async confirmAllotment(
    invoiceDispatchId: string,
    requests: ConfirmAllotmentLineRequest[],
    userId?: string
  ): Promise<CouponAllotmentHeaderWithLines> {
    if (requests.length === 0) {
      throw new ValidationError('At least one allotment line is required');
    }

    const dispatch = await invoiceDispatchDAO.findById(invoiceDispatchId);
    if (!dispatch) throw new NotFoundError('Invoice dispatch not found');
    if (dispatch.status !== 'confirmed') {
      throw new ConflictError('Coupons can only be allotted for a confirmed invoice dispatch');
    }

    const headerId = await db.transaction(async (client) => {
      let header = await this.headerDAO.findByInvoiceDispatchIdForUpdate(invoiceDispatchId, client);
      if (!header) {
        header = await this.headerDAO.create(
          { invoice_dispatch_id: invoiceDispatchId, created_by: userId ?? null },
          client
        );
      } else if (header.status === 'cancelled') {
        throw new ConflictError(
          'This invoice dispatch was cancelled; its coupon allotment cannot be reopened'
        );
      }

      for (const request of requests) {
        await this.confirmOneLine(header.id, invoiceDispatchId, request, userId, client);
      }

      return header.id;
    });

    return this.getHeaderWithLines(headerId);
  }

  private async confirmOneLine(
    headerId: string,
    invoiceDispatchId: string,
    request: ConfirmAllotmentLineRequest,
    userId: string | undefined,
    client: PoolClient
  ): Promise<void> {
    const dispatchLine = await invoiceDispatchLineDAO.findById(request.invoice_dispatch_line_id);
    if (!dispatchLine || dispatchLine.invoice_dispatch_id !== invoiceDispatchId) {
      throw new ValidationError('Invoice dispatch line does not belong to this invoice dispatch');
    }

    const creditedQty = await this.fetchConfirmedCreditNoteQtyByDispatchLineIds([
      request.invoice_dispatch_line_id,
    ]);
    const totalRequired = resolveEffectiveBagCount(
      dispatchLine,
      creditedQty.get(request.invoice_dispatch_line_id) ?? 0
    );
    if (!totalRequired) {
      throw new ValidationError(
        'This invoice line has no bag/packet count left to allot (none set, or fully credited)'
      );
    }

    const batch = await this.couponBatchDAO.findByIdForUpdate(request.coupon_batch_id, client);
    if (!batch) throw new NotFoundError('Coupon batch not found');

    // `serial_ranges` fans out into one slice per range (each becomes its own ledger row);
    // `serial_range`/`next_available` are just the single-slice case of the same loop.
    const slices: ResolvedSliceBounds[] =
      request.mode === 'serial_ranges'
        ? this.resolveNonOverlappingRanges(request.ranges, batch).map((r) => ({
            fromSeq: r.fromSeq,
            toSeq: r.toSeq,
          }))
        : request.mode === 'serial_range'
          ? [this.resolveSerialRangeSeq(request, batch)]
          : [null];

    for (const bounds of slices) {
      // Recomputed before every slice (not just once) so overlapping/adjacent slices in the
      // same request — or a "next_available" top-up after a manual range — are always
      // validated against the true remaining outstanding count, not a stale snapshot.
      const activeLines = await this.lineDAO.findActiveByInvoiceDispatchLineId(
        request.invoice_dispatch_line_id,
        client
      );
      const alreadyAllotted = activeLines.reduce((sum, l) => sum + l.coupons_allotted, 0);
      const outstanding = totalRequired - alreadyAllotted;
      if (outstanding <= 0) {
        throw new ConflictError('This invoice line is already fully allotted; nothing left to top up');
      }

      let requiredForThisSlice: number;
      if (bounds) {
        const span = bounds.toSeq - bounds.fromSeq + 1;
        if (span > outstanding) {
          throw new ValidationError(
            `Selected serial range covers ${span} coupon(s), which exceeds the ${outstanding} bag(s) still outstanding on this line`
          );
        }
        requiredForThisSlice = span;
      } else {
        requiredForThisSlice = outstanding;
      }

      await this.allotSlice(
        headerId,
        invoiceDispatchId,
        request.invoice_dispatch_line_id,
        request.coupon_batch_id,
        batch,
        requiredForThisSlice,
        bounds,
        request.mode ?? 'next_available',
        userId,
        client
      );
    }
  }

  /**
   * Locks coupons for one slice (either a serial range, or the next-available N when
   * `bounds` is null), creates its ledger row, transitions the coupons to `allotted`, and
   * links them via the junction table. One `coupon_allotment_lines` row is created per call,
   * which is what keeps the audit trail transparent even when a single confirm request
   * spans multiple disjoint ranges.
   */
  private async allotSlice(
    headerId: string,
    invoiceDispatchId: string,
    invoiceDispatchLineId: string,
    couponBatchId: string,
    batch: CouponBatch,
    required: number,
    bounds: ResolvedSliceBounds,
    mode: string,
    userId: string | undefined,
    client: PoolClient
  ): Promise<void> {
    const couponsResult = bounds
      ? await client.query<Coupon>(
          `SELECT * FROM coupons
           WHERE coupon_batch_id = $1 AND status = 'printed' AND batch_sequence BETWEEN $2 AND $3
           ORDER BY batch_sequence ASC
           FOR UPDATE`,
          [couponBatchId, bounds.fromSeq, bounds.toSeq]
        )
      : await client.query<Coupon>(
          `SELECT * FROM coupons
           WHERE coupon_batch_id = $1 AND status = 'printed'
           ORDER BY batch_sequence ASC
           LIMIT $2
           FOR UPDATE`,
          [couponBatchId, required]
        );
    const coupons = couponsResult.rows;

    const line = await this.lineDAO.create(
      {
        coupon_allotment_header_id: headerId,
        invoice_dispatch_line_id: invoiceDispatchLineId,
        coupon_batch_id: couponBatchId,
        face_value_paise: batch.face_value_paise,
        coupons_required: required,
        coupons_allotted: coupons.length,
        from_serial: coupons[0]?.serial_number ?? null,
        to_serial: coupons[coupons.length - 1]?.serial_number ?? null,
        created_by: userId ?? null,
      },
      client
    );

    for (const coupon of coupons) {
      await this.stateMachine.transition(
        coupon,
        'allotted',
        { changedBy: userId, reason: 'invoice_allotment' },
        client
      );
    }
    await this.lineCouponDAO.bulkInsert(line.id, coupons.map((c) => c.coupon_id), client);

    if (coupons.length < required) {
      logger.warn('Coupon allotment partially fulfilled — fewer printed coupons matched than requested', {
        invoiceDispatchId,
        invoiceDispatchLineId,
        couponBatchId,
        mode,
        requested: required,
        allotted: coupons.length,
      });
    }
  }

  // ---------------------------------------------------------------------
  // Unlink — manual (single line) or automatic (whole invoice on cancel/delete)
  // ---------------------------------------------------------------------

  /** Shared reversal core: unlinks one active line's coupons back to 'printed'. Idempotent. */
  private async unlinkLine(
    line: CouponAllotmentLine,
    reason: string,
    userId: string | undefined,
    client: PoolClient
  ): Promise<void> {
    if (line.status !== 'active') return;

    const couponIds = await this.lineCouponDAO.findActiveCouponIdsByLineId(line.id, client);
    if (couponIds.length > 0) {
      const couponsResult = await client.query<Coupon>(
        `SELECT * FROM coupons WHERE coupon_id = ANY($1::uuid[]) FOR UPDATE`,
        [couponIds]
      );
      for (const coupon of couponsResult.rows) {
        await this.stateMachine.transition(coupon, 'printed', { changedBy: userId, reason }, client);
      }
      await this.lineCouponDAO.markUnlinkedByLineId(line.id, reason, client);
    }

    await this.lineDAO.markUnlinked(line.id, reason, client);
  }

  /** Manual correction: unlink one allotment line without touching the rest of the invoice. */
  async unlinkAllotmentLine(
    lineId: string,
    reason: string,
    userId?: string
  ): Promise<CouponAllotmentLine> {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      throw new ValidationError('Unlink reason is required');
    }

    return db.transaction(async (client) => {
      const line = await this.lineDAO.findByIdForUpdate(lineId, client);
      if (!line) throw new NotFoundError('Coupon allotment line not found');
      if (line.status !== 'active') {
        throw new ConflictError('This allotment line is already unlinked');
      }

      await this.unlinkLine(line, trimmedReason, userId, client);
      const updated = await this.lineDAO.findById(lineId, client);
      if (!updated) throw new NotFoundError('Coupon allotment line not found');
      return updated;
    });
  }

  /**
   * Called from InvoiceDispatchService.cancel()/delete() inside their own transaction:
   * unlinks every active allotment line for the invoice and marks the header cancelled.
   * No-op (and idempotent) when the invoice never had any coupons allotted.
   */
  async reverseOnDispatchCancel(
    invoiceDispatchId: string,
    reason: string,
    userId: string | undefined,
    client: PoolClient
  ): Promise<void> {
    const header = await this.headerDAO.findByInvoiceDispatchIdForUpdate(invoiceDispatchId, client);
    if (!header || header.status === 'cancelled') return;

    const activeLines = await this.lineDAO.findActiveByHeaderId(header.id, client);
    for (const line of activeLines) {
      await this.unlinkLine(line, reason, userId, client);
    }

    await this.headerDAO.updateStatus(header.id, 'cancelled', client);
  }

  /**
   * Called from CreditNoteService.confirm() inside its transaction.
   * For each returned dispatch line, frees coupons proportional to qty returned / line qty
   * (1 coupon per bag). Peels from newest allotment lines / highest serials first.
   * Redeemed coupons are skipped. Header stays active so remaining bags can be re-allotted.
   */
  async reverseOnCreditNoteConfirm(
    input: {
      creditNoteId: string;
      invoiceDispatchId: string;
      lines: Array<{ invoice_dispatch_line_id: string; quantity_returned: number }>;
    },
    userId: string | undefined,
    client: PoolClient
  ): Promise<void> {
    const header = await this.headerDAO.findByInvoiceDispatchIdForUpdate(
      input.invoiceDispatchId,
      client
    );
    if (!header || header.status === 'cancelled') return;

    const reason = `credit_note:${input.creditNoteId}`;

    for (const cnLine of input.lines) {
      const dispatchLine = await invoiceDispatchLineDAO.findById(cnLine.invoice_dispatch_line_id);
      if (!dispatchLine || dispatchLine.invoice_dispatch_id !== input.invoiceDispatchId) {
        continue;
      }

      let remaining = bagsToUnlinkForReturn(dispatchLine, cnLine.quantity_returned);
      if (remaining <= 0) continue;

      const allotmentLines = await this.lineDAO.findActiveByInvoiceDispatchLineIdForUpdateDesc(
        cnLine.invoice_dispatch_line_id,
        client
      );

      for (const allotmentLine of allotmentLines) {
        if (remaining <= 0) break;

        const couponIds = await this.lineCouponDAO.findActiveAllottedCouponIdsByLineIdDesc(
          allotmentLine.id,
          remaining,
          client
        );
        if (couponIds.length === 0) continue;

        const couponsResult = await client.query<Coupon>(
          `SELECT * FROM coupons WHERE coupon_id = ANY($1::uuid[]) FOR UPDATE`,
          [couponIds]
        );
        for (const coupon of couponsResult.rows) {
          if (coupon.status !== 'allotted') continue;
          await this.stateMachine.transition(
            coupon,
            'printed',
            { changedBy: userId, reason },
            client
          );
        }

        await this.lineCouponDAO.markUnlinkedByCouponIds(
          allotmentLine.id,
          couponIds,
          reason,
          client
        );

        const summary = await this.lineCouponDAO.getActiveLinkSummaryByLineId(
          allotmentLine.id,
          client
        );
        if (summary.count <= 0) {
          await this.lineDAO.markUnlinked(allotmentLine.id, reason, client);
        } else {
          await this.lineDAO.updateAllottedCountAndSerials(
            allotmentLine.id,
            summary.count,
            summary.from_serial,
            summary.to_serial,
            client
          );
        }

        remaining -= couponIds.length;
        logger.info('Coupon allotment partially reversed for credit note', {
          creditNoteId: input.creditNoteId,
          invoiceDispatchLineId: cnLine.invoice_dispatch_line_id,
          couponAllotmentLineId: allotmentLine.id,
          unlinked: couponIds.length,
          remainingRequested: remaining,
        });
      }
    }
  }

  /**
   * Undo reverseOnCreditNoteConfirm. Coupons unlinked for this CN must still be `printed`
   * (not re-allotted or redeemed). Relinks them and reactivates allotment lines.
   */
  async relinkOnCreditNoteCancel(
    creditNoteId: string,
    userId: string | undefined,
    client: PoolClient
  ): Promise<void> {
    const reason = `credit_note:${creditNoteId}`;
    const rows = await this.lineCouponDAO.findUnlinkedByReason(reason, client);
    if (rows.length === 0) return;

    const byLine = new Map<string, string[]>();
    for (const row of rows) {
      const list = byLine.get(row.coupon_allotment_line_id) ?? [];
      list.push(row.coupon_id);
      byLine.set(row.coupon_allotment_line_id, list);
    }

    for (const [lineId, couponIds] of byLine) {
      const couponsResult = await client.query<Coupon>(
        `SELECT * FROM coupons WHERE coupon_id = ANY($1::uuid[]) FOR UPDATE`,
        [couponIds]
      );
      for (const coupon of couponsResult.rows) {
        if (coupon.status !== 'printed') {
          throw new ConflictError(
            `Cannot cancel credit note: coupon ${coupon.code} was ${coupon.status} after unlinking`
          );
        }
        await this.stateMachine.transition(
          coupon,
          'allotted',
          { changedBy: userId, reason: `credit_note_cancel:${creditNoteId}` },
          client
        );
      }
      await this.lineCouponDAO.clearUnlinkedByCouponIds(lineId, couponIds, client);
      await this.lineDAO.reactivateUnlinked(lineId, client);
      const summary = await this.lineCouponDAO.getActiveLinkSummaryByLineId(lineId, client);
      await client.query(
        `UPDATE coupon_allotment_lines
         SET coupons_allotted = $2, from_serial = $3, to_serial = $4, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [lineId, summary.count, summary.from_serial, summary.to_serial]
      );
    }
  }

  // ---------------------------------------------------------------------
  // Reads: header/lines for one invoice, cross-invoice history, batch progress
  // ---------------------------------------------------------------------

  async getHeaderWithLines(headerId: string): Promise<CouponAllotmentHeaderWithLines> {
    const header = await this.headerDAO.findById(headerId);
    if (!header) throw new NotFoundError('Coupon allotment header not found');
    const lines = await this.lineDAO.findByHeaderIdWithDetails(headerId);
    return { ...header, lines };
  }

  async getHeaderWithLinesByInvoiceDispatchId(
    invoiceDispatchId: string
  ): Promise<CouponAllotmentHeaderWithLines | null> {
    const header = await this.headerDAO.findByInvoiceDispatchId(invoiceDispatchId);
    if (!header) return null;
    const lines = await this.lineDAO.findByHeaderIdWithDetails(header.id);
    return { ...header, lines };
  }

  async getAllotmentHistory(
    filters: AllotmentHistoryFilters
  ): Promise<{ rows: AllotmentHistoryRow[]; total: number }> {
    if (!filters.coupon_batch_id && !filters.invoice_dispatch_id && !filters.search) {
      throw new BadRequestError(
        'Provide coupon_batch_id, invoice_dispatch_id, or search to view allotment history'
      );
    }
    return this.lineDAO.findHistory(filters);
  }

  /**
   * Worklist for the coupon allotment tab: confirmed sales invoices with rolled-up
   * coupons_required / coupons_allotted / outstanding (no per-invoice N+1).
   */
  async listInvoiceAllotmentSummaries(
    filters: InvoiceAllotmentSummaryFilters
  ): Promise<{ rows: InvoiceAllotmentSummary[]; total: number }> {
    return this.headerDAO.findInvoiceAllotmentSummaries(filters);
  }

  /**
   * Batch progress card: Total / Allotted / Remaining plus First/Last Allotted.
   * "Allotted" = coupons currently handed out (status allotted or redeemed — redemption
   * doesn't undo an allotment). "Remaining" = still available to allot (created + printed).
   * First/Last Allotted are historical events (MIN/MAX linked_at), unaffected by later unlinks.
   */
  async getBatchProgress(couponBatchId: string): Promise<CouponBatchAllotmentProgress> {
    const batch = await this.couponBatchDAO.findById(couponBatchId);
    if (!batch) throw new NotFoundError('Coupon batch not found');

    const stats = await this.couponBatchDAO.getStats(couponBatchId);
    const { first_allotted_at, last_allotted_at } =
      await this.lineCouponDAO.getFirstLastLinkedAtForBatch(couponBatchId);

    return {
      coupon_batch_id: couponBatchId,
      total_count: batch.total_count,
      allotted_count: stats.allotted + stats.redeemed,
      remaining_count: stats.created + stats.printed,
      first_allotted_at,
      last_allotted_at,
    };
  }
}

export const couponAllotmentService = new CouponAllotmentService();
