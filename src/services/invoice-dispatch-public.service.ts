import { randomBytes } from 'crypto';
import { invoiceDispatchDAO } from '../dao/invoice-dispatch.dao';
import { invoiceDispatchLineDAO } from '../dao/invoice-dispatch-line.dao';
import { eWayBillDAO } from '../dao/e-way-bill.dao';
import { NotFoundError } from '../utils/errors';
import type { BosVerificationResult } from '../models/invoice-dispatch-public.model';
import type { InvoiceDispatchLine } from '../models/invoice-dispatch-line.model';

function generateBosVerificationToken(): string {
  return randomBytes(32).toString('base64url');
}

function lineDescription(line: InvoiceDispatchLine): string {
  return line.product_alias?.trim() || 'Item';
}

export class InvoiceDispatchPublicService {
  /**
   * Issue a verification token for confirmed dispatches (idempotent).
   * Called on confirm and lazily when loading a confirmed dispatch without a token.
   */
  async ensureBosVerificationToken(dispatchId: string): Promise<string | null> {
    const dispatch = await invoiceDispatchDAO.findById(dispatchId);
    if (!dispatch || dispatch.status === 'cancelled') return null;
    if (dispatch.bos_verification_token) return dispatch.bos_verification_token;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const token = generateBosVerificationToken();
      try {
        await invoiceDispatchDAO.assignBosVerificationToken(dispatchId, token);
        const refreshed = await invoiceDispatchDAO.findById(dispatchId);
        if (refreshed?.bos_verification_token) {
          return refreshed.bos_verification_token;
        }
      } catch {
        // Unique collision — retry with a new token.
      }
    }

    const refreshed = await invoiceDispatchDAO.findById(dispatchId);
    return refreshed?.bos_verification_token ?? null;
  }

  async verifyByToken(token: string): Promise<BosVerificationResult> {
    const trimmed = token.trim();
    if (!trimmed) throw new NotFoundError('Verification record not found');

    const dispatch = await invoiceDispatchDAO.findByBosVerificationToken(trimmed);
    if (!dispatch) throw new NotFoundError('Verification record not found');

    const lines = await invoiceDispatchLineDAO.findByInvoiceDispatchId(dispatch.id);
    const ewayBills = await eWayBillDAO.findByInvoiceDispatchId(dispatch.id);
    const latestEwb = ewayBills.find((row) => row.status !== 'cancelled') ?? null;

    const grandTotal = lines.reduce((sum, line) => sum + Number(line.amount ?? 0), 0);
    const verifiedAt =
      dispatch.bos_verification_token_created_at instanceof Date
        ? dispatch.bos_verification_token_created_at.toISOString()
        : dispatch.bos_verification_token_created_at ?? dispatch.updated_at.toISOString();

    return {
      valid: dispatch.status !== 'cancelled',
      status:
        dispatch.status === 'cancelled'
          ? 'cancelled'
          : dispatch.status === 'draft'
            ? 'draft'
            : 'confirmed',
      internal_invoice_number: dispatch.internal_invoice_number,
      dispatch_date:
        typeof dispatch.dispatch_date === 'string'
          ? dispatch.dispatch_date
          : dispatch.dispatch_date
            ? new Date(dispatch.dispatch_date).toISOString().slice(0, 10)
            : null,
      party_name: dispatch.party_name,
      party_gst_number: dispatch.party_gst_number,
      grand_total: grandTotal,
      verified_at: verifiedAt,
      eway_bill_number: latestEwb?.eway_bill_number ?? null,
      lines: lines.map((line) => ({
        description: lineDescription(line),
        quantity: Number(line.quantity),
        quantity_unit: line.quantity_unit,
        rate: Number(line.rate),
        amount: Number(line.amount),
      })),
    };
  }
}

export const invoiceDispatchPublicService = new InvoiceDispatchPublicService();
