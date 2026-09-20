import { appConfig } from '../config/app.config';
import {
  DISPATCH_DISTANCE_KM_THRESHOLD,
  DISPATCH_DOCUMENT_GRACE_DAYS,
  type DispatchDistanceBand,
  type DispatchRequiredDocument,
} from '../constants/invoice-dispatch-documents';
import { indiaCalendarYmd, toCalendarYmd } from '../constants/financial-year';
import { invoiceDispatchDAO } from '../dao/invoice-dispatch.dao';
import { godownDAO } from '../dao/godown.dao';
import { salesSaudaDAO } from '../dao/sales-sauda.dao';
import { salesPartyDAO } from '../dao/sales-party.dao';
import type { InvoiceDispatch } from '../models/invoice-dispatch.model';
import type { Address } from '../models/vendor.model';
import { mastersIndiaApiService } from './masters-india-api.service';
import { ConflictError } from '../utils/errors';
import { logger } from '../utils/logger';

export interface InvoiceDispatchDocumentCompliance {
  distance_km: number | null;
  distance_band: DispatchDistanceBand;
  /** False for invoices created before this policy — no prompts, no next-bill block. */
  enforced: boolean;
  /** Preferred document for this distance band. Null when not enforced. */
  required_document: DispatchRequiredDocument | null;
  /**
   * True when the preferred document is a warning only (bilti band, or the other
   * file was already uploaded so create is unblocked).
   */
  is_recommendation: boolean;
  has_receiving_document: boolean;
  has_bilti: boolean;
  /** Preferred band document is on file. */
  has_required_document: boolean;
  grace_days: number;
  /** YYYY-MM-DD; dispatch_date (or created_at) + grace_days. */
  due_date: string | null;
  is_overdue: boolean;
  blocks_next_bill: boolean;
}

export interface NextBillBlocker {
  id: string;
  internal_invoice_number: string;
  serial_number: number | null;
  dispatch_date: string | null;
  due_date: string | null;
  distance_km: number | null;
  missing_document: DispatchRequiredDocument;
  party_name: string;
}

export interface NextBillEligibility {
  allowed: boolean;
  distance_threshold_km: number;
  grace_days: number;
  blocked_by: NextBillBlocker[];
}

function parseDistanceKm(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

export function distanceBandFromKm(distanceKm: number | null): DispatchDistanceBand {
  if (distanceKm == null) return 'unknown';
  return distanceKm < DISPATCH_DISTANCE_KM_THRESHOLD ? 'under_100' : 'over_100';
}

export function requiredDocumentForBand(
  band: DispatchDistanceBand
): DispatchRequiredDocument | null {
  if (band === 'under_100') return 'receiving_doc';
  if (band === 'over_100') return 'bilti';
  return null;
}

export function hasReceivingDocument(dispatch: Pick<
  InvoiceDispatch,
  'receiving_doc_image_url' | 'receiving_doc_pdf_url'
>): boolean {
  return Boolean(dispatch.receiving_doc_image_url || dispatch.receiving_doc_pdf_url);
}

/** Bilti or LR copy — same transport receipt under different names. */
export function hasBiltiDocument(dispatch: Pick<
  InvoiceDispatch,
  'bilti_image_url' | 'bilti_pdf_url' | 'lr_image_url' | 'lr_pdf_url'
>): boolean {
  return Boolean(
    dispatch.bilti_image_url ||
      dispatch.bilti_pdf_url ||
      dispatch.lr_image_url ||
      dispatch.lr_pdf_url
  );
}

function addCalendarDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function graceStartYmd(dispatch: Pick<InvoiceDispatch, 'dispatch_date' | 'created_at'>): string | null {
  return toCalendarYmd(dispatch.dispatch_date) ?? toCalendarYmd(dispatch.created_at);
}

export function dueDateFromDispatch(
  dispatch: Pick<InvoiceDispatch, 'dispatch_date' | 'created_at'>
): string | null {
  const start = graceStartYmd(dispatch);
  if (!start) return null;
  return addCalendarDays(start, DISPATCH_DOCUMENT_GRACE_DAYS);
}

function isPastDue(dueDate: string | null, todayYmd: string): boolean {
  return dueDate != null && todayYmd > dueDate;
}

function hasRequiredDocument(
  dispatch: InvoiceDispatch,
  required: DispatchRequiredDocument | null
): boolean {
  if (required === 'receiving_doc') return hasReceivingDocument(dispatch);
  if (required === 'bilti') return hasBiltiDocument(dispatch);
  return true;
}

/** Either receiving or bilti/LR — enough to clear the next-invoice gate. */
export function hasAnyDispatchDocument(dispatch: InvoiceDispatch): boolean {
  return hasReceivingDocument(dispatch) || hasBiltiDocument(dispatch);
}

function isComplianceEnforced(dispatch: Pick<InvoiceDispatch, 'document_compliance_required'>): boolean {
  return dispatch.document_compliance_required === true;
}

export function buildDocumentCompliance(
  dispatch: InvoiceDispatch,
  todayYmd: string = indiaCalendarYmd()
): InvoiceDispatchDocumentCompliance {
  const distanceKm = parseDistanceKm(dispatch.distance_km);
  const band = distanceBandFromKm(distanceKm);
  const enforced = isComplianceEnforced(dispatch);
  const required = enforced ? requiredDocumentForBand(band) : null;
  const hasReceiving = hasReceivingDocument(dispatch);
  const hasBilti = hasBiltiDocument(dispatch);
  const preferredUploaded = hasRequiredDocument(dispatch, required);
  const eitherUploaded = hasAnyDispatchDocument(dispatch);
  const dueDate = required ? dueDateFromDispatch(dispatch) : null;
  const pastDue = isPastDue(dueDate, todayYmd);
  const confirmed = dispatch.status === 'confirmed';
  const overduePreferred =
    enforced && confirmed && required != null && !preferredUploaded && pastDue;
  const blocksNextBill =
    enforced && confirmed && required != null && !eitherUploaded && pastDue;
  const isRecommendation =
    required != null &&
    !preferredUploaded &&
    (required === 'bilti' || eitherUploaded);

  return {
    distance_km: distanceKm,
    distance_band: band,
    enforced,
    required_document: required,
    is_recommendation: isRecommendation,
    has_receiving_document: hasReceiving,
    has_bilti: hasBilti,
    has_required_document: preferredUploaded,
    grace_days: DISPATCH_DOCUMENT_GRACE_DAYS,
    due_date: dueDate,
    is_overdue: overduePreferred,
    blocks_next_bill: blocksNextBill,
  };
}

function sixDigitPin(addr: Address | null | undefined): string | null {
  const pin = (addr?.pincode || '').replace(/\D/g, '').slice(0, 6);
  return pin.length === 6 ? pin : null;
}

function firstPin(...addrs: Array<Address | null | undefined>): string | null {
  for (const addr of addrs) {
    const pin = sixDigitPin(addr);
    if (pin) return pin;
  }
  return null;
}

function toBlocker(dispatch: InvoiceDispatch): NextBillBlocker {
  const compliance = buildDocumentCompliance(dispatch);
  return {
    id: dispatch.id,
    internal_invoice_number: dispatch.internal_invoice_number,
    serial_number:
      dispatch.serial_number != null ? Number(dispatch.serial_number) : null,
    dispatch_date: toCalendarYmd(dispatch.dispatch_date),
    due_date: compliance.due_date,
    distance_km: compliance.distance_km,
    missing_document: compliance.required_document ?? 'receiving_doc',
    party_name: dispatch.party_name,
  };
}

function formatBlockMessage(blockers: NextBillBlocker[]): string {
  const first = blockers[0];
  const docLabel =
    first.missing_document === 'bilti' ? 'bilti' : 'receiving document';
  const invoice = first.internal_invoice_number;
  const due = first.due_date ? ` (due ${first.due_date})` : '';
  if (blockers.length === 1) {
    return `Cannot create the next invoice. Upload the ${docLabel} for ${invoice}${due} to continue.`;
  }
  return `Cannot create the next invoice. ${blockers.length} confirmed invoices are missing documents after the ${DISPATCH_DOCUMENT_GRACE_DAYS}-day grace. Upload the ${docLabel} for ${invoice}${due} first.`;
}

export class InvoiceDispatchDocumentComplianceService {
  async getNextBillEligibility(): Promise<NextBillEligibility> {
    const rows = await invoiceDispatchDAO.findOverdueDocumentDispatches();
    const blocked_by = rows.map(toBlocker);
    return {
      allowed: blocked_by.length === 0,
      distance_threshold_km: DISPATCH_DISTANCE_KM_THRESHOLD,
      grace_days: DISPATCH_DOCUMENT_GRACE_DAYS,
      blocked_by,
    };
  }

  async assertCanCreateNextBill(): Promise<void> {
    const eligibility = await this.getNextBillEligibility();
    if (eligibility.allowed) return;
    throw new ConflictError(formatBlockMessage(eligibility.blocked_by));
  }

  /**
   * Fill distance_km from MastersIndia when the dispatch does not already have one.
   * Failures are logged and ignored — the document gate simply stays unclassified.
   */
  async ensureDistanceKm(dispatchId: string): Promise<number | null> {
    const dispatch = await invoiceDispatchDAO.findById(dispatchId);
    if (!dispatch) return null;

    const existing = parseDistanceKm(dispatch.distance_km);
    if (existing != null) return existing;

    const resolved = await this.lookupDistanceKm(dispatch);
    if (resolved == null) return null;

    await invoiceDispatchDAO.update(dispatchId, { distance_km: resolved });
    return resolved;
  }

  private async lookupDistanceKm(dispatch: InvoiceDispatch): Promise<number | null> {
    const godown = await godownDAO.findById(dispatch.godown_id);
    if (!godown) return null;

    const sauda = await salesSaudaDAO.findById(dispatch.sales_sauda_id);
    if (!sauda) return null;

    const fromPin = firstPin(godown.address);
    let toPin: string | null = null;

    if (sauda.movement_type === 'godown_transfer' && (dispatch.to_godown_id || sauda.to_godown_id)) {
      const destId = dispatch.to_godown_id || sauda.to_godown_id;
      const dest = destId ? await godownDAO.findById(destId) : null;
      toPin = firstPin(dest?.address);
    } else {
      const party = await salesPartyDAO.findById(sauda.sales_party_id);
      toPin = firstPin(sauda.delivery_address, sauda.billing_address, party?.address);
    }

    if (!fromPin || !toPin) {
      logger.warn('Skipping dispatch distance lookup; pincode missing', {
        dispatchId: dispatch.id,
        fromPin,
        toPin,
      });
      return null;
    }

    if (fromPin === toPin) {
      return 0;
    }

    const userGstin = (godown.gst_number || appConfig.apis.mastersIndia.sellerGstin || '')
      .trim()
      .toUpperCase();

    try {
      const km = await mastersIndiaApiService.calculateDistanceKm({
        fromPincode: fromPin,
        toPincode: toPin,
        userGstin,
      });
      if (!Number.isFinite(km)) return null;
      return Math.round(km * 100) / 100;
    } catch (err: unknown) {
      logger.warn('MastersIndia distance lookup failed for invoice dispatch', {
        dispatchId: dispatch.id,
        fromPin,
        toPin,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }
}

export const invoiceDispatchDocumentComplianceService =
  new InvoiceDispatchDocumentComplianceService();
