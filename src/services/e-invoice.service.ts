import { eInvoiceDAO } from '../dao/e-invoice.dao';
import { invoiceDispatchDAO } from '../dao/invoice-dispatch.dao';
import { NotFoundError, ConflictError } from '../utils/errors';

/**
 * Stub for MasterIndia e-invoice API. Replace with real HTTP client when integrating.
 * Idempotent: if e-invoice already exists for this dispatch, returns existing.
 */
export class EInvoiceService {
  async getByInvoiceDispatchId(invoiceDispatchId: string): Promise<{
    id: string;
    invoice_dispatch_id: string;
    irn: string;
    acknowledgement_number: string | null;
    ack_date: string | null;
    qr_code_content: string | null;
    government_response_payload: Record<string, unknown> | null;
    status: string;
    created_at: string;
    updated_at: string;
  } | null> {
    const existing = await eInvoiceDAO.findByInvoiceDispatchId(invoiceDispatchId);
    if (!existing) return null;
    return {
      id: existing.id,
      invoice_dispatch_id: existing.invoice_dispatch_id,
      irn: existing.irn,
      acknowledgement_number: existing.acknowledgement_number,
      ack_date: existing.ack_date?.toISOString() ?? null,
      qr_code_content: existing.qr_code_content,
      government_response_payload: existing.government_response_payload as Record<string, unknown> | null,
      status: existing.status,
      created_at: existing.created_at.toISOString(),
      updated_at: existing.updated_at.toISOString(),
    };
  }

  async generateForDispatch(invoiceDispatchId: string): Promise<{
    id: string;
    invoice_dispatch_id: string;
    irn: string;
    acknowledgement_number: string | null;
    ack_date: string | null;
    qr_code_content: string | null;
    government_response_payload: Record<string, unknown> | null;
    status: string;
    created_at: string;
    updated_at: string;
  }> {
    const dispatch = await invoiceDispatchDAO.findById(invoiceDispatchId);
    if (!dispatch) throw new NotFoundError('Invoice dispatch not found');
    if (dispatch.status !== 'confirmed') {
      throw new ConflictError('Invoice dispatch must be confirmed before generating e-invoice');
    }

    const existing = await eInvoiceDAO.findByInvoiceDispatchId(invoiceDispatchId);
    if (existing) {
      return {
        id: existing.id,
        invoice_dispatch_id: existing.invoice_dispatch_id,
        irn: existing.irn,
        acknowledgement_number: existing.acknowledgement_number,
        ack_date: existing.ack_date?.toISOString() ?? null,
        qr_code_content: existing.qr_code_content,
        government_response_payload: existing.government_response_payload as Record<string, unknown> | null,
        status: existing.status,
        created_at: existing.created_at.toISOString(),
        updated_at: existing.updated_at.toISOString(),
      };
    }

    // Stub: generate placeholder IRN. Replace with MasterIndia API call.
    const stubIrn = `IRN-STUB-${invoiceDispatchId.slice(0, 8)}-${Date.now()}`;
    const stubPayload = {
      Irn: stubIrn,
      AckNo: `ACK-${Date.now()}`,
      AckDt: new Date().toISOString(),
      SignedQRCode: 'stub-qr-code',
      Status: 'generated',
    };

    const created = await eInvoiceDAO.create({
      invoice_dispatch_id: invoiceDispatchId,
      irn: stubIrn,
      acknowledgement_number: (stubPayload as any).AckNo,
      ack_date: new Date(),
      qr_code_content: (stubPayload as any).SignedQRCode,
      government_response_payload: stubPayload,
      status: 'generated',
    });

    return {
      id: created.id,
      invoice_dispatch_id: created.invoice_dispatch_id,
      irn: created.irn,
      acknowledgement_number: created.acknowledgement_number,
      ack_date: created.ack_date?.toISOString() ?? null,
      qr_code_content: created.qr_code_content,
      government_response_payload: created.government_response_payload as Record<string, unknown> | null,
      status: created.status,
      created_at: created.created_at.toISOString(),
      updated_at: created.updated_at.toISOString(),
    };
  }
}

export const eInvoiceService = new EInvoiceService();
