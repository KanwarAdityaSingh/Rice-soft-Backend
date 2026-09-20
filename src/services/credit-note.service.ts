import { PoolClient } from 'pg';
import { db } from '../database/connection';
import { creditNoteDAO } from '../dao/credit-note.dao';
import { invoiceNumberSequenceDAO } from '../dao/invoice-number-sequence.dao';
import { creditNoteLineDAO } from '../dao/credit-note-line.dao';
import { creditNoteAttachmentDAO } from '../dao/credit-note-attachment.dao';
import { invoiceDispatchDAO } from '../dao/invoice-dispatch.dao';
import { invoiceDispatchLineDAO } from '../dao/invoice-dispatch-line.dao';
import { invoiceDispatchAllocationDAO } from '../dao/invoice-dispatch-allocation.dao';
import { invoiceDispatchLotAllocationDAO } from '../dao/invoice-dispatch-lot-allocation.dao';
import { finishedGoodsInventoryDAO } from '../dao/finished-goods-inventory.dao';
import { packagingDAO } from '../dao/packaging.dao';
import { inventoryLedgerDAO } from '../dao/inventory-ledger.dao';
import { lotInventoryAuditDAO } from '../dao/inventory-audit.dao';
import { godownDAO } from '../dao/godown.dao';
import { productDAO } from '../dao/product.dao';
import { inwardSlipLotDAO } from '../dao/inward-slip-lot.dao';
import { INVENTORY_AUDIT_REASONS } from '../models/inventory-audit.model';
import { financialYearFromDate, indiaCalendarYmd, toCalendarYmd } from '../constants/financial-year';
import {
  CREDIT_NOTE_ATTACHMENT_TYPES,
  CREDIT_NOTE_COUPON_STATUS_LABELS,
  CREDIT_NOTE_MATERIAL_CONDITION_LABELS,
  CREDIT_NOTE_STATUS_LABELS,
  CREDIT_NOTE_TYPE_LABELS,
  CreditNoteAttachmentType,
  CreditNoteCouponStatus,
  CreditNoteMaterialCondition,
  CreditNoteType,
  creditNoteOperationalClass,
  defaultCouponStatus,
  allowsCreditNoteLineDisplayAliases,
  isQuantityReturnType,
  isValueOnlyType,
} from '../constants/credit-note';
import {
  INVOICE_DOCUMENT_TYPE_CN,
  buildInvoiceSeriesKey,
  formatCreditNoteDocumentNumber,
  invoiceStateAlphaFromGstin,
  parseCreditNoteDocumentNumber,
} from '../constants/invoice-number-series';
import { isInterStateSupply, normalizeBuyerGstin } from '../constants/gst-state-codes';
import { BadRequestError, ConflictError, NotFoundError, ValidationError } from '../utils/errors';
import { creditNoteReasonProblem } from '../utils/credit-note-reason';
import { buildNormalizedSearchClause } from '../utils/search';
import { salesmanCommissionEntryDAO } from '../dao/salesman-commission-entry.dao';
import { brokerCommissionEntryDAO } from '../dao/broker-commission-entry.dao';
import { salesmanCommissionLedgerService } from './salesman-commission-ledger.service';
import { brokerCommissionLedgerService } from './broker-commission-ledger.service';
import { couponAllotmentService } from './coupon-allotment.service';
import { godownService } from './godown.service';
import { getDispatchLineEligibility, DispatchLineEligibility } from './credit-note-eligibility';
import {
  computeQuantityReturnFinancials,
  computeRateDifferenceFinancials,
  computeValueCreditFinancials,
  roundCreditMoney,
  sumLineFinancials,
  type CreditNoteLineFinancials,
} from './credit-note-financials';
import type {
  CreateCreditNoteRequest,
  CreditNote,
  CreditNoteLineInput,
  CreditNoteListFilters,
  CreditNotePreview,
  CreditNotePreviewGodown,
  CreditNotePreviewLine,
  UpdateCreditNoteRequest,
} from '../models/credit-note.model';
import type { CreateCreditNoteLineDTO } from '../models/credit-note-line.model';
import type { InvoiceDispatch } from '../models/invoice-dispatch.model';

function todayYmd(): string {
  return indiaCalendarYmd();
}

function toYmd(value: Date | string | null | undefined): string | null {
  return toCalendarYmd(value);
}

function fyOpeningYmd(financialYearLabel: string): string {
  const start = parseInt(financialYearLabel.split('-')[0] ?? '', 10);
  if (!Number.isFinite(start)) {
    throw new ValidationError(`Invalid financial year: ${financialYearLabel}`);
  }
  return `${start}-04-01`;
}

function num(value: unknown, fallback = 0): number {
  const n = parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : fallback;
}

/** First non-empty trimmed string, capped. Empty / null candidates are skipped. */
function coalesceDisplay(max: number, ...values: unknown[]): string | null {
  for (const value of values) {
    if (value == null) continue;
    const trimmed = String(value).trim();
    if (trimmed) return trimmed.slice(0, max);
  }
  return null;
}

type BuiltLine = CreateCreditNoteLineDTO & { financials: CreditNoteLineFinancials };

export class CreditNoteService {
  private resolveFinancialYear(date?: string | Date | null): string {
    const source = date != null && String(date).trim() !== '' ? date : new Date();
    return financialYearFromDate(source).label;
  }

  /**
   * Next credit-note number for the invoice godown GST state + CN FY.
   * Format A/HR/CN/26-27/32 — independent of Bill of Supply.
   */
  private async allocateCreditNoteNumber(
    dispatch: InvoiceDispatch,
    financialYear: string,
    client: PoolClient
  ): Promise<{ creditNoteNumber: string; serialNumber: number }> {
    const godown = await godownDAO.findById(dispatch.godown_id);
    if (!godown) throw new NotFoundError('Godown not found');
    const gstin = (godown.gst_number || '').trim();
    if (!gstin || gstin.length < 2) {
      throw new BadRequestError(
        'Godown GST number is required to generate credit note number'
      );
    }

    let stateAlpha: string;
    try {
      stateAlpha = invoiceStateAlphaFromGstin(gstin);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unsupported godown GST state';
      throw new BadRequestError(message);
    }

    const seriesKey = buildInvoiceSeriesKey(stateAlpha, financialYear, INVOICE_DOCUMENT_TYPE_CN);
    await this.syncCreditNoteSeriesTip(client, seriesKey, financialYear, stateAlpha);
    const sequence = await invoiceNumberSequenceDAO.allocateNext(
      seriesKey,
      financialYear,
      stateAlpha,
      INVOICE_DOCUMENT_TYPE_CN,
      client
    );

    return {
      creditNoteNumber: formatCreditNoteDocumentNumber({
        stateAlpha,
        financialYearLabel: financialYear,
        sequence,
      }),
      serialNumber: sequence,
    };
  }

  private async syncCreditNoteSeriesTip(
    client: PoolClient,
    seriesKey: string,
    financialYear: string,
    stateAlpha: string
  ): Promise<number> {
    const tip = await invoiceNumberSequenceDAO.lockAndGetLastValue(
      seriesKey,
      financialYear,
      stateAlpha,
      INVOICE_DOCUMENT_TYPE_CN,
      client
    );
    const maxExisting = await this.maxCreditNoteSequenceInSeries(
      client,
      financialYear,
      stateAlpha
    );
    if (maxExisting !== tip) {
      await client.query(
        `UPDATE invoice_number_sequences
         SET last_value = $1, updated_at = CURRENT_TIMESTAMP
         WHERE series_key = $2`,
        [maxExisting, seriesKey]
      );
    }
    return maxExisting;
  }

  private async maxCreditNoteSequenceInSeries(
    client: PoolClient,
    financialYear: string,
    stateAlpha: string
  ): Promise<number> {
    const rows = await client.query<{ credit_note_number: string }>(
      `SELECT credit_note_number FROM credit_notes WHERE financial_year = $1`,
      [financialYear]
    );
    let max = 0;
    for (const row of rows.rows) {
      const parsed = parseCreditNoteDocumentNumber(row.credit_note_number);
      if (parsed && parsed.stateAlpha === stateAlpha && parsed.sequence > max) {
        max = parsed.sequence;
      }
    }
    return max;
  }

  private async invoiceHasCouponAllotment(invoiceDispatchId: string): Promise<boolean> {
    try {
      const coupon = await couponAllotmentService.getHeaderWithLinesByInvoiceDispatchId(
        invoiceDispatchId
      );
      if (!coupon) return false;
      return coupon.lines.some((line) => Number(line.coupons_allotted) > 0);
    } catch {
      return false;
    }
  }

  /**
   * Coupon status is only an operational choice when goods come back AND the invoice
   * actually has allotted coupons. Otherwise persist not_applicable.
   */
  private async resolveCouponStatus(
    invoiceDispatchId: string,
    type: CreditNoteType,
    requested: CreditNoteCouponStatus | null | undefined
  ): Promise<CreditNoteCouponStatus> {
    if (isValueOnlyType(type) && requested === 'returned_with_goods') {
        throw new ValidationError(
        'Coupon status returned_with_goods is only valid for quantity-return credit notes'
      );
    }
    if (isValueOnlyType(type)) return 'not_applicable';
    const hasAllotment = await this.invoiceHasCouponAllotment(invoiceDispatchId);
    if (!hasAllotment) return 'not_applicable';
    return requested ?? defaultCouponStatus(type);
  }

  private async resolveInterState(dispatch: InvoiceDispatch): Promise<boolean> {
    const godown = await godownDAO.findById(dispatch.godown_id);
    const sellerGstin = (godown?.gst_number || '').trim().toUpperCase();
    const buyerGstin = normalizeBuyerGstin(dispatch.party_gst_number);
    return isInterStateSupply(sellerGstin, buyerGstin);
  }

  private assertCreditNoteDate(params: {
    creditNoteDate: string;
    invoiceDate: string | null;
    financialYear: string;
  }): void {
    const { creditNoteDate, invoiceDate, financialYear } = params;
    const today = todayYmd();
    if (creditNoteDate > today) {
      throw new ValidationError('Credit note date cannot be in the future');
    }
    const opening = fyOpeningYmd(financialYear);
    if (creditNoteDate < opening) {
        throw new ValidationError(
        `Credit note date cannot be before financial year opening (${opening})`
      );
    }
    if (invoiceDate && creditNoteDate < invoiceDate) {
      throw new ValidationError('Credit note date cannot be before the original invoice date');
    }
  }

  private async assertSalesInvoice(dispatch: InvoiceDispatch): Promise<void> {
    if (dispatch.status !== 'confirmed') {
      throw new ValidationError('Invoice dispatch must be confirmed');
    }
    if (dispatch.to_godown_id) {
      throw new ValidationError('Credit notes are not allowed on godown transfer dispatches');
    }
  }

  async list(filters: CreditNoteListFilters) {
    return creditNoteDAO.findAll(filters);
  }

  async listEligibleInvoices(input: {
    search?: string;
    godownId?: string;
    pagination?: { limit: number; offset: number };
  }) {
    let where = ` WHERE d.status = 'confirmed' AND d.to_godown_id IS NULL`;
    const params: unknown[] = [];
    let n = 1;
    if (input.godownId) {
      where += ` AND d.godown_id = $${n++}`;
      params.push(input.godownId);
    }
    const searchClause = buildNormalizedSearchClause(
      [
        'd.internal_invoice_number',
        'd.serial_number',
        'd.party_name',
        'sp.phone',
        'sp.business_name',
        'v.vehicle_number',
      ],
      input.search,
      n
    );
    where += searchClause.sql;
    params.push(...searchClause.params);
    n = searchClause.nextParamIndex;

    const from = `
      FROM invoice_dispatches d
      LEFT JOIN godowns g ON g.id = d.godown_id
      LEFT JOIN vehicles v ON v.id = d.vehicle_id
      LEFT JOIN sales_saudas ss ON ss.id = d.sales_sauda_id
      LEFT JOIN sales_parties sp ON sp.id = ss.sales_party_id
    `;
    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count ${from}${where}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);
    const limit = input.pagination?.limit ?? 50;
    const offset = input.pagination?.offset ?? 0;
    const result = await db.query<{
      id: string;
      invoice_number: string;
      party_name: string;
      invoice_date: string | null;
      invoice_amount: string;
      vehicle_number: string | null;
      godown_id: string;
      godown_name: string | null;
    }>(
      `SELECT d.id,
              d.internal_invoice_number AS invoice_number,
              d.party_name,
              TO_CHAR(d.dispatch_date, 'YYYY-MM-DD') AS invoice_date,
              COALESCE((
                SELECT SUM(idl.amount) FROM invoice_dispatch_lines idl
                WHERE idl.invoice_dispatch_id = d.id
              ), 0)::text AS invoice_amount,
              v.vehicle_number,
              d.godown_id,
              g.name AS godown_name
       ${from}
       ${where}
       ORDER BY d.serial_number DESC NULLS LAST, d.created_at DESC
       LIMIT $${n++} OFFSET $${n}`,
      [...params, limit, offset]
    );
    return {
      rows: result.rows.map((r) => ({
        id: r.id,
        invoice_number: r.invoice_number,
        party_name: r.party_name,
        invoice_date: r.invoice_date,
        invoice_amount: roundCreditMoney(num(r.invoice_amount)),
        vehicle_number: r.vehicle_number,
        godown_id: r.godown_id,
        godown_name: r.godown_name,
      })),
      total,
    };
  }

  async getInvoiceContext(invoiceDispatchId: string, excludeCreditNoteId?: string) {
    const dispatch = await invoiceDispatchDAO.findById(invoiceDispatchId);
    if (!dispatch) throw new NotFoundError('Invoice dispatch not found');
    await this.assertSalesInvoice(dispatch);
    const interState = await this.resolveInterState(dispatch);
    const eligibility = await getDispatchLineEligibility(invoiceDispatchId, {
      excludeCreditNoteId,
      interState,
    });

    const productIds = [...new Set([...eligibility.values()].map((e) => e.product_id).filter((id): id is string => !!id))];
    const lotIds = [...new Set([...eligibility.values()].map((e) => e.lot_id).filter((id): id is string => !!id))];
    const [products, lots] = await Promise.all([
      Promise.all(productIds.map((id) => productDAO.findById(id))),
      Promise.all(lotIds.map((id) => inwardSlipLotDAO.findById(id))),
    ]);
    const productName = new Map(
      products.filter(Boolean).map((p) => [p!.id, p!.name] as const)
    );
    const productBrand = new Map(
      products.filter(Boolean).map((p) => [p!.id, p!.brand] as const)
    );
    const productHsn = new Map(
      products.filter(Boolean).map((p) => [p!.id, p!.hsn_code] as const)
    );
    const lotLabel = new Map(
      lots.filter(Boolean).map((l) => [l!.id, l!.lot_number] as const)
    );

    const lines = [...eligibility.values()].map((e) => ({
      invoice_dispatch_line_id: e.invoice_dispatch_line_id,
      product_id: e.product_id,
      product_alias: e.product_alias,
      brand: e.product_id ? productBrand.get(e.product_id) ?? null : null,
      hsn_code: e.product_id ? productHsn.get(e.product_id) ?? null : null,
      variety: e.product_id
        ? productName.get(e.product_id) ?? e.product_alias
        : e.lot_id
          ? `Lot ${lotLabel.get(e.lot_id) ?? e.lot_id}`
          : e.product_alias,
      lot_id: e.lot_id,
      invoiced_qty: e.invoiced_qty,
      already_credited_qty: e.credited_qty,
      remaining_qty: e.remaining_qty,
      invoiced_rate: e.invoiced_rate,
      original_final: e.original_final,
      already_credited_value: e.credited_value,
      remaining_value: e.remaining_value,
      quantity_unit: e.quantity_unit,
      packet_count: e.packet_count,
      no_of_bags: e.no_of_bags,
      gst_percent: e.ctx.gstPercent,
    }));

    const invoice_value = roundCreditMoney(lines.reduce((s, l) => s + l.original_final, 0));
    const previous_credits = roundCreditMoney(lines.reduce((s, l) => s + l.already_credited_value, 0));
    const remaining_invoice = roundCreditMoney(lines.reduce((s, l) => s + l.remaining_value, 0));
    const invoice_quantity = roundCreditMoney(lines.reduce((s, l) => s + l.invoiced_qty, 0));

    let coupon: Awaited<ReturnType<typeof couponAllotmentService.getHeaderWithLinesByInvoiceDispatchId>> =
      null;
    try {
      coupon = await couponAllotmentService.getHeaderWithLinesByInvoiceDispatchId(invoiceDispatchId);
    } catch {
      coupon = null;
    }

    return {
      invoice: {
        id: dispatch.id,
        invoice_number: dispatch.internal_invoice_number,
        invoice_date: toYmd(dispatch.dispatch_date),
        party_name: dispatch.party_name,
        party_gst_number: dispatch.party_gst_number,
        invoice_amount: invoice_value,
        invoice_quantity,
        varieties: lines.map((l) => l.variety).filter(Boolean),
        godown_id: dispatch.godown_id,
      },
      lines,
      financial_summary: {
        invoice_value,
        previous_credits,
        remaining_invoice,
      },
      coupon: coupon
        ? {
            header_id: coupon.id,
            status: coupon.status,
            lines: coupon.lines.map((l) => ({
              coupon_batch_id: l.coupon_batch_id,
              coupon_batch_code: l.coupon_batch_code,
              coupons_allotted: l.coupons_allotted,
              variety_label: l.variety_label,
            })),
          }
        : null,
    };
  }

  async getById(id: string) {
    const cn = await creditNoteDAO.findById(id);
    if (!cn) throw new NotFoundError('Credit note not found');
    const [lines, attachments, dispatch] = await Promise.all([
      creditNoteLineDAO.findByCreditNoteId(id),
      creditNoteAttachmentDAO.findByCreditNoteId(id),
      invoiceDispatchDAO.findById(cn.invoice_dispatch_id),
    ]);

    const invoiceValue = dispatch
      ? (await this.getInvoiceContext(cn.invoice_dispatch_id, id)).financial_summary.invoice_value
      : 0;
    const previousCredits = dispatch
      ? await creditNoteDAO.sumPostedCreditsByDispatch(cn.invoice_dispatch_id, id)
      : 0;
    const currentCredit = num(cn.total_credit_amount);
    const remainingInvoice = roundCreditMoney(
      Math.max(0, invoiceValue - previousCredits - (cn.status === 'cancelled' ? 0 : currentCredit))
    );

    const timeline = [
      dispatch
        ? { event: 'invoice_created', at: dispatch.created_at, label: 'Invoice created' }
        : null,
      { event: 'credit_note_created', at: cn.created_at, label: 'Credit note created' },
      cn.posted_at ? { event: 'gst_posted', at: cn.posted_at, label: 'GST posted / ledger updated' } : null,
      cn.posted_at ? { event: 'credit_note_posted', at: cn.posted_at, label: 'Credit note posted' } : null,
      cn.cancelled_at
        ? { event: 'credit_note_cancelled', at: cn.cancelled_at, label: 'Credit note cancelled' }
        : null,
    ].filter(Boolean);

    return {
      ...cn,
      lines,
      attachments,
      invoice: dispatch
        ? {
            id: dispatch.id,
            invoice_number: dispatch.internal_invoice_number,
            invoice_date: toYmd(dispatch.dispatch_date),
            party_name: dispatch.party_name,
            party_gst_number: dispatch.party_gst_number,
          }
        : null,
      financial_summary: {
        invoice_value: invoiceValue,
        previous_credits: previousCredits,
        current_credit: currentCredit,
        total_credits: roundCreditMoney(previousCredits + (cn.status === 'cancelled' ? 0 : currentCredit)),
        remaining_invoice: remainingInvoice,
        gst_reversal: {
          cgst: num(cn.cgst_amount),
          sgst: num(cn.sgst_amount),
          igst: num(cn.igst_amount),
        },
        net_credit: currentCredit,
      },
      timeline,
    };
  }

  /**
   * Display-ready credit note for the preview pane / print / form.
   * Resolves party, godown, product names, and human labels.
   */
  async getPreview(id: string): Promise<CreditNotePreview> {
    const detail = await this.getById(id);
    const dispatch = await invoiceDispatchDAO.findById(detail.invoice_dispatch_id);
    const dispatchLines = dispatch
      ? await invoiceDispatchLineDAO.findByInvoiceDispatchId(dispatch.id)
      : [];
    const aliasByLineId = new Map(
      dispatchLines.map((l) => [l.id, l.product_alias?.trim() || null])
    );

    const productIds = [
      ...new Set(
        (detail.lines ?? [])
          .map((l) => l.product_id)
          .filter((pid): pid is string => Boolean(pid))
      ),
    ];
    const products = await Promise.all(productIds.map((pid) => productDAO.findById(pid)));
    const productById = new Map(
      products.filter((p): p is NonNullable<typeof p> => Boolean(p)).map((p) => [p.id, p])
    );

    const sellerGodown = dispatch ? await godownDAO.findById(dispatch.godown_id) : null;
    const receivingGodown = detail.receiving_godown_id
      ? await godownDAO.findById(detail.receiving_godown_id)
      : null;

    const toGodown = (g: NonNullable<typeof sellerGodown>): CreditNotePreviewGodown => ({
      id: g.id,
      name: g.name,
      gstin: g.gst_number,
      address: g.address ?? null,
    });

    const useDisplayAliases = allowsCreditNoteLineDisplayAliases(detail.credit_note_type);
    const lines: CreditNotePreviewLine[] = (detail.lines ?? []).map((line) => {
      const product = line.product_id ? productById.get(line.product_id) : undefined;
      const invoiceAlias = aliasByLineId.get(line.invoice_dispatch_line_id) ?? null;
      const alias =
        coalesceDisplay(
          255,
          useDisplayAliases ? line.product_alias : null,
          invoiceAlias,
          product?.name
        ) || (line.product_id ? 'Product' : 'Lot line');
      const cgst = num(line.cgst_amount);
      const sgst = num(line.sgst_amount);
      const igst = num(line.igst_amount);
      return {
        id: line.id,
        invoice_dispatch_line_id: line.invoice_dispatch_line_id,
        product_id: line.product_id,
        product_name: alias,
        product_alias: coalesceDisplay(
          255,
          useDisplayAliases ? line.product_alias : null,
          invoiceAlias
        ),
        brand: coalesceDisplay(255, useDisplayAliases ? line.brand : null, product?.brand),
        hsn_code: coalesceDisplay(20, useDisplayAliases ? line.hsn_code : null, product?.hsn_code),
        quantity_credited: num(line.quantity_credited) || num(line.quantity_returned),
        quantity_invoiced: line.quantity_invoiced != null ? num(line.quantity_invoiced) : null,
        quantity_verified: line.quantity_verified != null ? num(line.quantity_verified) : null,
        quantity_short: line.quantity_short != null ? num(line.quantity_short) : null,
        quantity_actual_returned:
          line.quantity_actual_returned != null ? num(line.quantity_actual_returned) : null,
        original_rate: line.original_rate != null ? num(line.original_rate) : null,
        corrected_rate: line.corrected_rate != null ? num(line.corrected_rate) : null,
        rate: line.rate != null ? num(line.rate) : null,
        gst_percent: line.gst_percent != null ? num(line.gst_percent) : null,
        taxable_amount: num(line.taxable_amount),
        cgst_amount: cgst,
        sgst_amount: sgst,
        igst_amount: igst,
        gst_amount: roundCreditMoney(cgst + sgst + igst),
        final_amount: num(line.final_amount),
      };
    });

    const previewNotice =
      detail.status === 'draft'
        ? 'Draft — not posted to ledger or GST'
        : detail.status === 'cancelled'
          ? 'Cancelled'
          : null;

    return {
      id: detail.id,
      document_type: 'CN',
      document_number: detail.credit_note_number,
      document_date: toYmd(detail.credit_note_date),
      financial_year: detail.financial_year ?? null,
      serial_number: detail.serial_number != null ? Number(detail.serial_number) : null,
      status: detail.status,
      status_label: CREDIT_NOTE_STATUS_LABELS[detail.status],
      credit_note_type: detail.credit_note_type,
      credit_note_type_label: CREDIT_NOTE_TYPE_LABELS[detail.credit_note_type],
      operational_class: creditNoteOperationalClass(detail.credit_note_type),
      reason: detail.reason,
      coupon_status: detail.coupon_status,
      coupon_status_label: CREDIT_NOTE_COUPON_STATUS_LABELS[detail.coupon_status],
      material_condition: detail.material_condition,
      material_condition_label: detail.material_condition
        ? CREDIT_NOTE_MATERIAL_CONDITION_LABELS[detail.material_condition]
        : null,
      preview_notice: previewNotice,
      invoice_dispatch_id: detail.invoice_dispatch_id,
      sales_sauda_id: detail.sales_sauda_id,
      seller: sellerGodown ? toGodown(sellerGodown) : null,
      buyer: {
        name: dispatch?.party_name ?? detail.invoice?.party_name ?? null,
        gstin: dispatch?.party_gst_number ?? detail.invoice?.party_gst_number ?? null,
        pan: dispatch?.party_pan_number ?? null,
        phone: null,
        address: dispatch?.party_address ?? null,
      },
      invoice: dispatch
        ? {
            id: dispatch.id,
            invoice_number: dispatch.internal_invoice_number,
            invoice_date: toYmd(dispatch.dispatch_date),
            invoice_amount: num(detail.financial_summary?.invoice_value),
            godown_id: dispatch.godown_id,
          }
        : null,
      receiving_godown: receivingGodown ? toGodown(receivingGodown) : null,
      lines,
      totals: {
        taxable_amount: num(detail.taxable_amount),
        cgst_amount: num(detail.cgst_amount),
        sgst_amount: num(detail.sgst_amount),
        igst_amount: num(detail.igst_amount),
        gst_amount: roundCreditMoney(
          num(detail.cgst_amount) + num(detail.sgst_amount) + num(detail.igst_amount)
        ),
        total_credit_amount: num(detail.total_credit_amount),
      },
      financial_summary: detail.financial_summary,
      attachments: detail.attachments ?? [],
      timeline: (detail.timeline ?? []).filter(Boolean) as CreditNotePreview['timeline'],
    };
  }

  async create(data: CreateCreditNoteRequest, userId?: string) {
    const dispatch = await this.loadConfirmedSalesDispatch(data.invoice_dispatch_id);
    const creditNoteDate = toYmd(data.credit_note_date) || todayYmd();
    const financialYear = this.resolveFinancialYear(creditNoteDate);
    this.assertCreditNoteDate({
      creditNoteDate,
      invoiceDate: toYmd(dispatch.dispatch_date),
      financialYear,
    });
    if (!data.reason || !data.reason.trim()) {
      throw new ValidationError('Reason is required');
    }
    const reasonProblem = creditNoteReasonProblem(data.reason);
    if (reasonProblem) throw new ValidationError(reasonProblem);

    const type = data.credit_note_type;
    const couponStatus = await this.resolveCouponStatus(
      dispatch.id,
      type,
      data.coupon_status
    );
    const { headerExtras, builtLines } = await this.buildValidatedLines({
      dispatch,
      type,
      couponStatus,
      materialCondition: data.material_condition ?? null,
      receivingGodownId: data.receiving_godown_id ?? null,
      lines: data.lines ?? [],
    });

    const totals = sumLineFinancials(builtLines.map((l) => l.financials));

    try {
      const created = await db.transaction(async (client) => {
        const allocated = await this.allocateCreditNoteNumber(dispatch, financialYear, client);
        const header = await creditNoteDAO.create(
          {
            invoice_dispatch_id: dispatch.id,
            sales_sauda_id: dispatch.sales_sauda_id,
            credit_note_number: allocated.creditNoteNumber,
            credit_note_date: creditNoteDate,
            financial_year: financialYear,
            serial_number: allocated.serialNumber,
            credit_note_type: type,
            reason: data.reason.trim(),
            coupon_status: couponStatus,
            material_condition: headerExtras.material_condition,
            receiving_godown_id: headerExtras.receiving_godown_id,
            ...totals,
            created_by: userId,
          },
          client
        );
        for (const line of builtLines) {
          await creditNoteLineDAO.create({ ...line, credit_note_id: header.id }, client);
        }
        return header.id;
      });
      return this.getById(created);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === '23505') {
        throw new ConflictError('Credit note number already exists for this financial year');
      }
      throw err;
    }
  }

  async update(id: string, data: UpdateCreditNoteRequest, userId?: string) {
    const existing = await creditNoteDAO.findById(id);
    if (!existing) throw new NotFoundError('Credit note not found');
    if (existing.status !== 'draft') {
      throw new ValidationError('Only draft credit notes can be edited');
    }
    if (!data.edit_reason || !data.edit_reason.trim()) {
      throw new ValidationError('Reason for edit is required');
    }
    const editReason = data.edit_reason.trim();

    const dispatch = await this.loadConfirmedSalesDispatch(existing.invoice_dispatch_id);
    const type = data.credit_note_type ?? existing.credit_note_type;
    const creditNoteDate =
      toYmd(data.credit_note_date) || toYmd(existing.credit_note_date) || todayYmd();
    const financialYear = this.resolveFinancialYear(creditNoteDate);
    this.assertCreditNoteDate({
      creditNoteDate,
      invoiceDate: toYmd(dispatch.dispatch_date),
      financialYear,
    });
    const reason = (data.reason ?? existing.reason ?? '').trim();
    if (!reason) throw new ValidationError('Reason is required');
    const reasonProblem = creditNoteReasonProblem(reason);
    if (reasonProblem) throw new ValidationError(reasonProblem);

    const couponStatus = await this.resolveCouponStatus(
      dispatch.id,
      type,
      data.coupon_status ?? existing.coupon_status
    );
    const materialCondition =
      data.material_condition !== undefined
        ? data.material_condition
        : existing.material_condition;
    const receivingGodownId =
      data.receiving_godown_id !== undefined
        ? data.receiving_godown_id
        : existing.receiving_godown_id;

    const existingLines = await creditNoteLineDAO.findByCreditNoteId(id);
    const lineInputs: CreditNoteLineInput[] =
      data.lines ??
      existingLines.map((l) => ({
        invoice_dispatch_line_id: l.invoice_dispatch_line_id,
        product_id: l.product_id,
        product_alias: l.product_alias,
        brand: l.brand,
        hsn_code: l.hsn_code,
        quantity_credited: num(l.quantity_credited) || num(l.quantity_returned),
        quantity_returned: num(l.quantity_returned),
        quantity_actual_returned: l.quantity_actual_returned,
        quantity_verified: l.quantity_verified,
        corrected_rate: l.corrected_rate,
        credit_taxable_input: l.credit_taxable_input,
      }));

    const { headerExtras, builtLines } = await this.buildValidatedLines({
      dispatch,
      type,
      couponStatus,
      materialCondition,
      receivingGodownId,
      lines: lineInputs,
      excludeCreditNoteId: id,
    });
    const totals = sumLineFinancials(builtLines.map((l) => l.financials));

    await db.transaction(async (client) => {
      await creditNoteDAO.updateHeader(
        id,
        {
          credit_note_date: creditNoteDate,
          financial_year: financialYear,
          credit_note_type: type,
          reason,
          coupon_status: couponStatus,
          material_condition: headerExtras.material_condition,
          receiving_godown_id: headerExtras.receiving_godown_id,
          ...totals,
          edit_reason: editReason,
          updated_by: userId,
        },
        client
      );
      await creditNoteLineDAO.deleteByCreditNoteId(id, client);
      for (const line of builtLines) {
        await creditNoteLineDAO.create({ ...line, credit_note_id: id }, client);
      }
    });

    return this.getById(id);
  }

  async confirm(id: string, userId?: string) {
    const cn = await creditNoteDAO.findById(id);
    if (!cn) throw new NotFoundError('Credit note not found');
    if (cn.status === 'posted') return this.getById(id);
    if (cn.status === 'cancelled') {
      throw new ValidationError('Cannot post a cancelled credit note');
    }
    if (cn.status !== 'draft') {
      throw new ValidationError(`Cannot post credit note in status ${cn.status}`);
    }

    const dispatch = await this.loadConfirmedSalesDispatch(cn.invoice_dispatch_id);
    const lines = await creditNoteLineDAO.findByCreditNoteId(id);
    if (lines.length === 0) throw new ValidationError('Credit note has no lines');

    // Re-validate remaining against other drafts/posted CNs
    const interState = await this.resolveInterState(dispatch);
    const eligibility = await getDispatchLineEligibility(dispatch.id, {
      excludeCreditNoteId: id,
      interState,
    });
    for (const line of lines) {
      const el = eligibility.get(line.invoice_dispatch_line_id);
      if (!el) {
        throw new ValidationError(`Invoice line not found: ${line.invoice_dispatch_line_id}`);
      }
      const credited = num(line.quantity_credited) || num(line.quantity_returned);
      if (isQuantityReturnType(cn.credit_note_type) && credited > el.remaining_qty + 1e-6) {
        throw new ValidationError(
          `quantity exceeds remaining eligible ${el.remaining_qty} for line ${line.invoice_dispatch_line_id}`
        );
      }
      if (num(line.final_amount) > el.remaining_value + 0.009) {
        throw new ValidationError(
          `Credit ₹${num(line.final_amount).toFixed(2)} exceeds remaining ₹${el.remaining_value.toFixed(2)} for line ${line.invoice_dispatch_line_id}`
        );
      }
    }

    // Quantity returns restore only what confirm deducted (FIFO / lot allocations).
    // Invoices confirmed with no stock write no allocations — post without inventing FGI.
    const restoreInventory =
      isQuantityReturnType(cn.credit_note_type) && cn.material_condition !== 'destroy';
    const targetGodownId = cn.receiving_godown_id ?? dispatch.godown_id;

    await db.transaction(async (client: PoolClient) => {
      if (restoreInventory) {
      for (const line of lines) {
          const toRestore = num(line.quantity_credited) || num(line.quantity_returned);
          if (toRestore <= 0) continue;
          await this.restoreInventoryForLine({
            creditNoteId: id,
            line: {
              invoice_dispatch_line_id: line.invoice_dispatch_line_id,
              product_id: line.product_id,
            },
            toRestore,
            dispatchGodownId: dispatch.godown_id,
            targetGodownId,
            userId,
            client,
          });
        }
      }

      await creditNoteDAO.markPosted(id, userId, client);

      if (cn.coupon_status === 'returned_with_goods') {
        await couponAllotmentService.reverseOnCreditNoteConfirm(
          {
            creditNoteId: id,
            invoiceDispatchId: cn.invoice_dispatch_id,
            lines: lines.map((l) => ({
              invoice_dispatch_line_id: l.invoice_dispatch_line_id,
              quantity_returned: num(l.quantity_credited) || num(l.quantity_returned),
            })),
          },
          userId,
          client
        );
      }

      await salesmanCommissionLedgerService.reverseOnCreditNoteConfirm(id, userId, client);
      await brokerCommissionLedgerService.reverseOnCreditNoteConfirm(id, userId, client);
    });

    return this.getById(id);
  }

  async cancel(id: string, reason: string, userId?: string) {
    const cn = await creditNoteDAO.findById(id);
    if (!cn) throw new NotFoundError('Credit note not found');
    if (cn.status === 'cancelled') return this.getById(id);
    if (!reason || !reason.trim()) {
      throw new ValidationError('Cancel reason is required');
    }

    if (cn.status === 'draft') {
      await creditNoteDAO.markCancelled(id, reason.trim(), userId);
      return this.getById(id);
    }

    if (cn.status !== 'posted') {
      throw new ValidationError(`Cannot cancel credit note in status ${cn.status}`);
    }

    await db.transaction(async (client: PoolClient) => {
      await salesmanCommissionLedgerService.voidPendingReversalOnCreditNoteCancel(id, client);
      await brokerCommissionLedgerService.voidPendingReversalOnCreditNoteCancel(id, client);
      await this.reversePostedEffects(cn, userId, client);
      await creditNoteDAO.markCancelled(id, reason.trim(), userId, client);
    });

    return this.getById(id);
  }

  /**
   * Hard-delete a credit note in any status, same series rule as invoice
   * dispatch: only the latest A/{ST}/CN/ number may be removed. Posted notes
   * reverse inventory, coupons, and commission reversals first.
   */
  async delete(id: string, userId?: string): Promise<void> {
    const cn = await creditNoteDAO.findById(id);
    if (!cn) throw new NotFoundError('Credit note not found');

    const parsed = parseCreditNoteDocumentNumber(cn.credit_note_number);
    if (!parsed) {
      throw new ConflictError(
        `Unrecognized credit note number "${cn.credit_note_number}"`
      );
    }

    const seriesKey = buildInvoiceSeriesKey(
      parsed.stateAlpha,
      cn.financial_year,
      INVOICE_DOCUMENT_TYPE_CN
    );

    await db.transaction(async (client: PoolClient) => {
      const tip = await this.syncCreditNoteSeriesTip(
        client,
        seriesKey,
        cn.financial_year,
        parsed.stateAlpha
      );
      if (tip !== parsed.sequence) {
        throw new ConflictError(
          `Only the latest credit note in the series can be deleted. ` +
            `"${cn.credit_note_number}" is sequence ${parsed.sequence}, ` +
            `but the series tip is ${tip}. Delete newer credit notes (sequence ${tip} down to ${parsed.sequence + 1}) first.`
        );
      }

      if (cn.status === 'posted') {
        await this.reversePostedEffects(cn, userId, client);
      }

      await salesmanCommissionEntryDAO.deleteAllByCreditNoteId(id, client);
      await brokerCommissionEntryDAO.deleteAllByCreditNoteId(id, client);

      await client.query(
        `DELETE FROM e_way_bills
         WHERE credit_note_id = $1 AND invoice_dispatch_id IS NULL`,
        [id]
      );
      await client.query(
        `UPDATE e_way_bills SET credit_note_id = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE credit_note_id = $1`,
        [id]
      );

      await client.query(
        `DELETE FROM inventory_ledger
         WHERE reference_type = 'credit_note' AND reference_id = $1`,
        [id]
      );
      await client.query(
        `DELETE FROM lot_inventory_audit
         WHERE reference_type = 'credit_note' AND reference_id = $1`,
        [id]
      );

      await creditNoteAttachmentDAO.deleteByCreditNoteId(id, client);
      await creditNoteLineDAO.deleteByCreditNoteId(id, client);

      const removed = await creditNoteDAO.deleteById(id, client);
      if (!removed) throw new NotFoundError('Credit note not found');

      const released = await invoiceNumberSequenceDAO.releaseTip(
        seriesKey,
        parsed.sequence,
        client
      );
      if (!released) {
        throw new ConflictError(
          'Credit note series tip changed concurrently; retry delete of the current latest credit note'
        );
      }
    });
  }

  private async reversePostedEffects(
    cn: CreditNote,
    userId: string | undefined,
    client: PoolClient
  ): Promise<void> {
    if (cn.coupon_status === 'returned_with_goods') {
      await couponAllotmentService.relinkOnCreditNoteCancel(cn.id, userId, client);
    }

    const restoredInventory =
      isQuantityReturnType(cn.credit_note_type) && cn.material_condition !== 'destroy';
    if (restoredInventory) {
      await this.reverseInventoryForCreditNote(cn.id, userId, client);
    }
  }

  async addAttachment(
    id: string,
    data: {
      document_type: CreditNoteAttachmentType;
      file_url: string;
      file_name?: string | null;
      mime_type?: string | null;
    },
    userId?: string
  ) {
    const cn = await creditNoteDAO.findById(id);
    if (!cn) throw new NotFoundError('Credit note not found');
    if (cn.status === 'cancelled') {
      throw new ValidationError('Cannot attach documents to a cancelled credit note');
    }
    if (!(CREDIT_NOTE_ATTACHMENT_TYPES as readonly string[]).includes(data.document_type)) {
      throw new ValidationError('Invalid attachment document type');
    }
    await creditNoteAttachmentDAO.create({
      credit_note_id: id,
      document_type: data.document_type,
      file_url: data.file_url,
      file_name: data.file_name ?? null,
      mime_type: data.mime_type ?? null,
      created_by: userId ?? null,
    });
    return this.getById(id);
  }

  private async loadConfirmedSalesDispatch(invoiceDispatchId: string): Promise<InvoiceDispatch> {
    const dispatch = await invoiceDispatchDAO.findById(invoiceDispatchId);
    if (!dispatch) throw new NotFoundError('Invoice dispatch not found');
    await this.assertSalesInvoice(dispatch);
    return dispatch;
  }

  private async buildValidatedLines(input: {
    dispatch: InvoiceDispatch;
    type: CreditNoteType;
    couponStatus: CreditNoteCouponStatus;
    materialCondition: CreditNoteMaterialCondition | null;
    receivingGodownId: string | null;
    lines: CreditNoteLineInput[];
    excludeCreditNoteId?: string;
  }): Promise<{
    headerExtras: {
      material_condition: CreditNoteMaterialCondition | null;
      receiving_godown_id: string | null;
    };
    builtLines: BuiltLine[];
  }> {
    const { dispatch, type } = input;
    if (isValueOnlyType(type) && input.couponStatus === 'returned_with_goods') {
      throw new ValidationError(
        'Coupon status returned_with_goods is only valid for quantity-return credit notes'
      );
    }

    let material_condition = input.materialCondition;
    let receiving_godown_id = input.receivingGodownId;
    if (type === 'damaged_goods') {
      if (!material_condition) {
        throw new ValidationError('Material condition is required for damaged goods');
      }
      if (material_condition !== 'destroy') {
        receiving_godown_id = receiving_godown_id || dispatch.godown_id;
        await godownService.assertActive(receiving_godown_id);
      } else {
        receiving_godown_id = receiving_godown_id || null;
      }
    } else if (material_condition && type !== 'quality_issue') {
      throw new ValidationError('Material condition is only valid for damaged goods or quality issue');
    } else if (receiving_godown_id && type !== 'quality_issue') {
      throw new ValidationError('Receiving godown is only valid for damaged goods or quality issue');
    } else if (receiving_godown_id) {
      await godownService.assertActive(receiving_godown_id);
    }

    const interState = await this.resolveInterState(dispatch);
    const eligibility = await getDispatchLineEligibility(dispatch.id, {
      excludeCreditNoteId: input.excludeCreditNoteId,
      interState,
    });

    let lineInputs = input.lines;
    if (type === 'sales_return_full') {
      if (!lineInputs.length) {
        lineInputs = [...eligibility.values()]
          .filter((e) => e.remaining_qty > 0)
          .map((e) => ({
            invoice_dispatch_line_id: e.invoice_dispatch_line_id,
            product_id: e.product_id,
            quantity_credited: e.remaining_qty,
          }));
      }
      if (!lineInputs.length) {
        throw new ValidationError('No remaining eligible quantity to return on this invoice');
      }
    }
    if (!lineInputs.length) {
      throw new ValidationError('At least one credit note line is required');
    }

    const useDisplayAliases = allowsCreditNoteLineDisplayAliases(type);
    const productIds = useDisplayAliases
      ? [
          ...new Set(
            [...eligibility.values()]
              .map((e) => e.product_id)
              .filter((id): id is string => Boolean(id))
          ),
        ]
      : [];
    const products = await Promise.all(productIds.map((id) => productDAO.findById(id)));
    const productById = new Map(
      products.filter((p): p is NonNullable<typeof p> => Boolean(p)).map((p) => [p.id, p])
    );

    const seen = new Set<string>();
    const builtLines: BuiltLine[] = [];

    for (const raw of lineInputs) {
      if (seen.has(raw.invoice_dispatch_line_id)) {
        throw new ValidationError(
          `Duplicate invoice line ${raw.invoice_dispatch_line_id} in credit note`
        );
      }
      seen.add(raw.invoice_dispatch_line_id);
      const el = eligibility.get(raw.invoice_dispatch_line_id);
      if (!el) {
        throw new ValidationError(
          `Invoice dispatch line not found: ${raw.invoice_dispatch_line_id}`
        );
      }
      const built = this.buildOneLine(type, raw, el);
      if (useDisplayAliases) {
        const product = built.product_id ? productById.get(built.product_id) : undefined;
        built.product_alias = coalesceDisplay(
          255,
          raw.product_alias,
          el.product_alias,
          product?.name
        );
        built.brand = coalesceDisplay(255, raw.brand, product?.brand);
        built.hsn_code = coalesceDisplay(20, raw.hsn_code, product?.hsn_code);
      } else {
        built.product_alias = null;
        built.brand = null;
        built.hsn_code = null;
      }
      builtLines.push(built);
    }

    return {
      headerExtras: { material_condition, receiving_godown_id },
      builtLines,
    };
  }

  private buildOneLine(
    type: CreditNoteType,
    raw: CreditNoteLineInput,
    el: DispatchLineEligibility
  ): BuiltLine {
    const qtyHint = num(raw.quantity_credited ?? raw.quantity_returned);

    if (type === 'short_quantity') {
      const invoiced = el.invoiced_qty;
      const verified = num(raw.quantity_verified);
      if (!(verified > 0) || verified > invoiced + 1e-6) {
        throw new ValidationError(
          `Warehouse verified quantity must be > 0 and <= invoiced ${invoiced}`
        );
      }
      if (verified > el.remaining_qty + 1e-6) {
        throw new ValidationError(
          `Verified quantity ${verified} exceeds remaining eligible ${el.remaining_qty}`
        );
      }
      const actual = raw.quantity_actual_returned != null ? num(raw.quantity_actual_returned) : null;
      const financials = computeQuantityReturnFinancials({
        quantity: verified,
        remainingQty: el.remaining_qty,
        remainingValue: el.remaining_value,
        ctx: el.ctx,
      });
      return this.toBuiltLine(raw, el, financials, {
        quantity_credited: verified,
        quantity_returned: verified,
        quantity_invoiced: invoiced,
        quantity_actual_returned: actual,
        quantity_verified: verified,
        quantity_short: roundCreditMoney(invoiced - verified),
      });
    }

    if (type === 'rate_difference') {
      const qty = qtyHint > 0 ? qtyHint : el.invoiced_qty;
      if (qty > el.invoiced_qty + 1e-6) {
        throw new ValidationError(
          `Rate-difference quantity cannot exceed invoiced ${el.invoiced_qty}`
        );
      }
      const corrected = num(raw.corrected_rate);
      const financials = computeRateDifferenceFinancials({
        quantity: qty,
        originalRate: el.invoiced_rate,
        correctedRate: corrected,
        remainingValue: el.remaining_value,
        ctx: el.ctx,
      });
      return this.toBuiltLine(raw, el, financials, {
        quantity_credited: qty,
        quantity_returned: qty,
        quantity_invoiced: el.invoiced_qty,
        original_rate: el.invoiced_rate,
        corrected_rate: corrected,
      });
    }

    if (type === 'commercial_discount' || type === 'other') {
      const taxable = num(raw.credit_taxable_input);
      const financials = computeValueCreditFinancials({
        taxableInput: taxable,
        remainingValue: el.remaining_value,
        ctx: el.ctx,
      });
      return this.toBuiltLine(raw, el, financials, {
        quantity_credited: 0,
        quantity_returned: 0,
        quantity_invoiced: el.invoiced_qty,
        credit_taxable_input: taxable,
      });
    }

    // quantity returns: full / partial / quality / damaged
    const qty = qtyHint;
    if (!(qty > 0)) {
      throw new ValidationError('Return quantity must be greater than 0');
    }
    if (qty > el.remaining_qty + 1e-6) {
      throw new ValidationError(
        `Return quantity ${qty} exceeds remaining eligible ${el.remaining_qty} (invoiced ${el.invoiced_qty}, already credited ${el.credited_qty})`
      );
    }
    if (type === 'sales_return_full' && qty < el.remaining_qty - 1e-6) {
      throw new ValidationError(
        `Full sales return must credit remaining eligible quantity ${el.remaining_qty}`
      );
    }
    const financials = computeQuantityReturnFinancials({
      quantity: qty,
      remainingQty: el.remaining_qty,
      remainingValue: el.remaining_value,
      ctx: el.ctx,
    });
    return this.toBuiltLine(raw, el, financials, {
      quantity_credited: qty,
      quantity_returned: qty,
      quantity_invoiced: el.invoiced_qty,
    });
  }

  private toBuiltLine(
    raw: CreditNoteLineInput,
    el: DispatchLineEligibility,
    financials: CreditNoteLineFinancials,
    extra: Partial<CreateCreditNoteLineDTO>
  ): BuiltLine {
    return {
      credit_note_id: '',
      invoice_dispatch_line_id: raw.invoice_dispatch_line_id,
      product_id: raw.product_id ?? el.product_id,
      product_alias: null,
      brand: null,
      hsn_code: null,
      quantity_returned: extra.quantity_returned ?? 0,
      quantity_credited: extra.quantity_credited ?? 0,
      quantity_invoiced: extra.quantity_invoiced ?? el.invoiced_qty,
      quantity_actual_returned: extra.quantity_actual_returned ?? null,
      quantity_verified: extra.quantity_verified ?? null,
      quantity_short: extra.quantity_short ?? null,
      original_rate: extra.original_rate ?? el.invoiced_rate,
      corrected_rate: extra.corrected_rate ?? null,
      credit_taxable_input: extra.credit_taxable_input ?? null,
      rate: financials.rate,
      gst_percent: financials.gst_percent,
      discount_value: financials.discount_value,
      discount_type: financials.discount_type,
      taxable_amount: financials.taxable_amount,
      cgst_amount: financials.cgst_amount,
      sgst_amount: financials.sgst_amount,
      igst_amount: financials.igst_amount,
      final_amount: financials.final_amount,
      financials,
    };
  }

  private async restoreInventoryForLine(input: {
    creditNoteId: string;
    line: { invoice_dispatch_line_id: string; product_id: string | null };
    toRestore: number;
    dispatchGodownId: string;
    targetGodownId: string;
    userId?: string;
    client: PoolClient;
  }): Promise<void> {
    const { creditNoteId: id, line, toRestore, dispatchGodownId, targetGodownId, userId, client } =
      input;
    const sameGodown = targetGodownId === dispatchGodownId;

    const lotAllocations = await invoiceDispatchLotAllocationDAO.findByInvoiceDispatchLineId(
            line.invoice_dispatch_line_id,
            client
          );
        if (lotAllocations.length > 0) {
          let remaining = toRestore;
          for (const alloc of lotAllocations) {
            if (remaining <= 0) break;
        const addBack = Math.min(remaining, parseFloat(alloc.quantity_deducted.toString()));
            remaining -= addBack;
            const locked = await client.query<{
              id: string;
              lot_id: string;
              available_quantity: string | number;
        }>(`SELECT id, lot_id, available_quantity FROM lot_inventory WHERE id = $1 FOR UPDATE`, [
          alloc.lot_inventory_id,
        ]);
            if (locked.rows.length === 0) {
          throw new ConflictError(`Lot inventory ${alloc.lot_inventory_id} not found to restore into`);
            }
            const inv = locked.rows[0];
            const stockBefore = parseFloat(inv.available_quantity.toString());
            const stockAfter = stockBefore + addBack;
            await client.query(
          `UPDATE lot_inventory SET available_quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
              [stockAfter, inv.id]
            );
            await lotInventoryAuditDAO.create(
              {
                lot_inventory_id: inv.id,
                lot_id: alloc.lot_id,
                operation_type: 'addition',
                quantity_change: addBack,
                quantity_before: stockBefore,
                quantity_after: stockAfter,
                reason: INVENTORY_AUDIT_REASONS.LOT.SALE_RETURN,
                reference_type: 'credit_note',
                reference_id: id,
                created_by: userId,
              },
              client
            );
          }
          if (remaining > 0.001) {
            throw new ConflictError(
              `Could not fully restore lot qty for credit note line (${remaining} kg left)`
            );
          }
      return;
    }

    const allocations = await invoiceDispatchAllocationDAO.findByInvoiceDispatchLineId(
      line.invoice_dispatch_line_id
    );
    // Confirm may succeed with zero FGI deducted. A return must not create packed stock
    // the sale never took — post the credit note with no inventory write.
    if (allocations.length === 0) {
      return;
    }

    if (!sameGodown) {
      await this.restoreToGodownFgi({
        creditNoteId: id,
        productId: line.product_id,
        dispatchLineId: line.invoice_dispatch_line_id,
        qty: toRestore,
        godownId: targetGodownId,
        userId,
        client,
      });
      return;
    }

    let remaining = toRestore;
    for (const alloc of allocations) {
      if (remaining <= 0) break;
      const fgi = await finishedGoodsInventoryDAO.findById(alloc.finished_goods_inventory_id);
      if (!fgi) continue;
      const addBack = Math.min(remaining, parseFloat(alloc.quantity_deducted.toString()));
      remaining -= addBack;
      await this.applyFgiRestore({
        fgiId: fgi.id,
        productId: line.product_id,
        godownId: fgi.godown_id,
        addBack,
        packagingId: fgi.packaging_id,
        batchId: fgi.batch_id,
        creditNoteId: id,
        userId,
        client,
      });
    }
    if (remaining > 0.001) {
      await this.restoreToGodownFgi({
        creditNoteId: id,
        productId: line.product_id,
        dispatchLineId: line.invoice_dispatch_line_id,
        qty: remaining,
        godownId: targetGodownId,
        userId,
        client,
      });
    }
  }

  private async restoreToGodownFgi(input: {
    creditNoteId: string;
    productId: string | null;
    dispatchLineId: string;
    qty: number;
    godownId: string;
    userId?: string;
    client: PoolClient;
  }): Promise<void> {
    if (!input.productId) {
      throw new ConflictError('Cannot restore credit note line without product or lot allocations');
          }
          const fgiRows = await finishedGoodsInventoryDAO.findAll(
      input.productId,
            undefined,
      input.godownId
    );
    if (fgiRows.length > 0) {
      const row = fgiRows[0];
      await this.applyFgiRestore({
        fgiId: row.id,
        productId: input.productId,
        godownId: input.godownId,
        addBack: input.qty,
        packagingId: row.packaging_id,
        batchId: row.batch_id,
        creditNoteId: input.creditNoteId,
        userId: input.userId,
        client: input.client,
      });
      return;
    }

    const allocations = await invoiceDispatchAllocationDAO.findByInvoiceDispatchLineId(
      input.dispatchLineId
    );
    let packagingId: string | null = null;
    let batchId: string | null = null;
    if (allocations[0]) {
      const src = await finishedGoodsInventoryDAO.findById(allocations[0].finished_goods_inventory_id);
      packagingId = src?.packaging_id ?? null;
      batchId = src?.batch_id ?? null;
    }
    if (!packagingId) {
            throw new ConflictError(
        `No FGI row found for product ${input.productId} at receiving godown to restore into`
      );
    }

    const inserted = await input.client.query<{ id: string }>(
      `INSERT INTO finished_goods_inventory
         (godown_id, product_id, batch_id, packaging_id, no_of_packets, total_weight, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [input.godownId, input.productId, batchId, packagingId, 0, 0, input.userId ?? null]
    );
    await this.applyFgiRestore({
      fgiId: inserted.rows[0].id,
      productId: input.productId,
      godownId: input.godownId,
      addBack: input.qty,
      packagingId,
      batchId,
      creditNoteId: input.creditNoteId,
      userId: input.userId,
      client: input.client,
    });
  }

  private async applyFgiRestore(input: {
    fgiId: string;
    productId: string | null;
    godownId: string;
    addBack: number;
    packagingId: string | null;
    batchId: string | null;
    creditNoteId: string;
    userId?: string;
    client: PoolClient;
  }): Promise<void> {
    const locked = await input.client.query<{
      total_weight: string | number;
      no_of_packets: string | number;
      packaging_id: string;
      batch_id: string | null;
    }>(
      `SELECT total_weight, no_of_packets, packaging_id, batch_id
       FROM finished_goods_inventory WHERE id = $1 FOR UPDATE`,
      [input.fgiId]
    );
    if (locked.rows.length === 0) {
      throw new ConflictError('FGI row not found to restore into');
    }
    const row = locked.rows[0];
    const stockBefore = parseFloat(row.total_weight.toString());
    const newWeight = stockBefore + input.addBack;
    let newPackets = parseFloat(row.no_of_packets.toString()) || 0;
    const packagingId = input.packagingId || row.packaging_id;
    if (packagingId) {
      const pkg = await packagingDAO.findById(packagingId);
            const capacity = pkg ? Number(pkg.holding_capacity) : 1;
      newPackets = newPackets + Math.ceil(input.addBack / (capacity || 1));
    }
    await input.client.query(
      `UPDATE finished_goods_inventory
       SET no_of_packets = $1, total_weight = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [newPackets, newWeight, input.fgiId]
    );
    if (!input.productId) {
            throw new ConflictError('FGI restore requires product_id on credit note line');
          }
          await inventoryLedgerDAO.create(
            {
        godown_id: input.godownId,
        product_id: input.productId,
        quantity_change: input.addBack,
              source_type: 'sale_return',
        source_id: input.creditNoteId,
              stock_before: stockBefore,
              stock_after: newWeight,
              reference_type: 'credit_note',
        reference_id: input.creditNoteId,
        batch_id: (input.batchId ?? row.batch_id) ?? undefined,
        packaging_id: packagingId,
        created_by: input.userId,
      },
      input.client
    );
  }

  private async reverseInventoryForCreditNote(
    creditNoteId: string,
    userId: string | undefined,
    client: PoolClient
  ): Promise<void> {
    const ledger = await client.query<{
      id: string;
      godown_id: string;
      product_id: string;
      quantity_change: string;
      packaging_id: string | null;
      batch_id: string | null;
    }>(
      `SELECT id, godown_id, product_id, quantity_change, packaging_id, batch_id
       FROM inventory_ledger
       WHERE reference_type = 'credit_note' AND reference_id = $1
         AND quantity_change > 0
       ORDER BY created_at ASC`,
      [creditNoteId]
    );

    for (const entry of ledger.rows) {
      const qty = parseFloat(entry.quantity_change);
      const fgi = await client.query<{
        id: string;
        total_weight: string;
        no_of_packets: string;
        packaging_id: string;
      }>(
        `SELECT id, total_weight, no_of_packets, packaging_id
         FROM finished_goods_inventory
         WHERE godown_id = $1 AND product_id = $2
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE`,
        [entry.godown_id, entry.product_id]
      );
      if (fgi.rows.length === 0) {
        throw new ConflictError('Cannot cancel: FGI row from credit note restore is missing');
      }
      const row = fgi.rows[0];
      const stockBefore = parseFloat(row.total_weight);
      if (stockBefore + 1e-6 < qty) {
        throw new ConflictError(
          `Cannot cancel: inventory already used after this credit note (${qty} kg needed at godown)`
        );
      }
      const newWeight = stockBefore - qty;
      let newPackets = parseFloat(row.no_of_packets) || 0;
      if (row.packaging_id) {
        const pkg = await packagingDAO.findById(row.packaging_id);
        const capacity = pkg ? Number(pkg.holding_capacity) : 1;
        newPackets = Math.max(0, newPackets - Math.ceil(qty / (capacity || 1)));
      }
          await client.query(
        `UPDATE finished_goods_inventory
         SET no_of_packets = $1, total_weight = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [newPackets, newWeight, row.id]
          );
          await inventoryLedgerDAO.create(
            {
          godown_id: entry.godown_id,
          product_id: entry.product_id,
          quantity_change: -qty,
              source_type: 'sale_return',
          source_id: creditNoteId,
              stock_before: stockBefore,
              stock_after: newWeight,
              reference_type: 'credit_note',
          reference_id: creditNoteId,
          batch_id: entry.batch_id ?? undefined,
          packaging_id: entry.packaging_id ?? row.packaging_id,
              created_by: userId,
            },
            client
          );
    }

    const audits = await client.query<{
      lot_inventory_id: string | null;
      lot_id: string;
      quantity_change: string;
    }>(
      `SELECT lot_inventory_id, lot_id, quantity_change
       FROM lot_inventory_audit
       WHERE reference_type = 'credit_note' AND reference_id = $1
         AND operation_type = 'addition'
       ORDER BY created_at ASC`,
      [creditNoteId]
    );
    for (const audit of audits.rows) {
      if (!audit.lot_inventory_id) continue;
      const qty = parseFloat(audit.quantity_change);
      const locked = await client.query<{
        id: string;
        lot_id: string;
        available_quantity: string;
      }>(`SELECT id, lot_id, available_quantity FROM lot_inventory WHERE id = $1 FOR UPDATE`, [
        audit.lot_inventory_id,
      ]);
      if (locked.rows.length === 0) {
        throw new ConflictError('Cannot cancel: lot inventory from credit note restore is missing');
      }
      const inv = locked.rows[0];
      const stockBefore = parseFloat(inv.available_quantity);
      if (stockBefore + 1e-6 < qty) {
        throw new ConflictError('Cannot cancel: lot inventory already used after this credit note');
      }
      const stockAfter = stockBefore - qty;
      await client.query(
        `UPDATE lot_inventory SET available_quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [stockAfter, inv.id]
      );
      await lotInventoryAuditDAO.create(
        {
          lot_inventory_id: inv.id,
          lot_id: inv.lot_id,
          operation_type: 'reduction',
          quantity_change: -qty,
          quantity_before: stockBefore,
          quantity_after: stockAfter,
          reason: INVENTORY_AUDIT_REASONS.LOT.SALE_RETURN,
          reference_type: 'credit_note',
          reference_id: creditNoteId,
          created_by: userId,
        },
        client
      );
    }
  }
}

export const creditNoteService = new CreditNoteService();
