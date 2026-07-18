import { eInvoiceDAO } from '../dao/e-invoice.dao';
import { invoiceDispatchDAO } from '../dao/invoice-dispatch.dao';
import { ConflictError, NotFoundError } from '../utils/errors';
import { mastersIndiaApiService } from './masters-india-api.service';
import {
  buildEInvoicePayload,
  loadSalesDocumentContext,
} from './masters-india-sales-document.service';

type EInvoicePayload = {
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
};

function mapRow(row: Awaited<ReturnType<typeof eInvoiceDAO.findByInvoiceDispatchId>>): EInvoicePayload {
  if (!row) throw new NotFoundError('E-Invoice not found');
  return {
    id: row.id,
    invoice_dispatch_id: row.invoice_dispatch_id,
    irn: row.irn,
    acknowledgement_number: row.acknowledgement_number,
    ack_date: row.ack_date?.toISOString() ?? null,
    qr_code_content: row.qr_code_content,
    government_response_payload: row.government_response_payload as Record<string, unknown> | null,
    status: row.status,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

function parseEInvoiceResponse(message: Record<string, unknown>): {
  irn: string;
  acknowledgement_number: string | null;
  ack_date: Date | null;
  qr_code_content: string | null;
} {
  const irn = String(message.Irn || message.irn || '').trim();
  if (!irn) {
    throw new ConflictError('MastersIndia e-invoice response did not include IRN');
  }

  const ackNo = message.AckNo ?? message.ackNo ?? message.acknowledgement_number;
  const ackDtRaw = message.AckDt ?? message.ackDt ?? message.ack_date;
  const qr = message.SignedQRCode ?? message.signed_qr_code ?? message.qr_code;

  return {
    irn,
    acknowledgement_number: ackNo != null ? String(ackNo) : null,
    ack_date: ackDtRaw ? new Date(String(ackDtRaw)) : new Date(),
    qr_code_content: qr != null ? String(qr) : null,
  };
}

export class EInvoiceService {
  async getByInvoiceDispatchId(invoiceDispatchId: string): Promise<EInvoicePayload | null> {
    const existing = await eInvoiceDAO.findByInvoiceDispatchId(invoiceDispatchId);
    if (!existing) return null;
    return mapRow(existing);
  }

  async generateForDispatch(invoiceDispatchId: string): Promise<EInvoicePayload> {
    const dispatch = await invoiceDispatchDAO.findById(invoiceDispatchId);
    if (!dispatch) throw new NotFoundError('Invoice dispatch not found');
    if (dispatch.status !== 'confirmed') {
      throw new ConflictError('Invoice dispatch must be confirmed before generating e-invoice');
    }

    const existing = await eInvoiceDAO.findByInvoiceDispatchId(invoiceDispatchId);
    if (existing) {
      return mapRow(existing);
    }

    const ctx = await loadSalesDocumentContext(invoiceDispatchId);
    const requestPayload = buildEInvoicePayload(ctx);
    const responseMessage = await mastersIndiaApiService.generateEInvoice(requestPayload);
    const parsed = parseEInvoiceResponse(responseMessage);

    const created = await eInvoiceDAO.create({
      invoice_dispatch_id: invoiceDispatchId,
      irn: parsed.irn,
      acknowledgement_number: parsed.acknowledgement_number ?? undefined,
      ack_date: parsed.ack_date ?? undefined,
      qr_code_content: parsed.qr_code_content ?? undefined,
      government_response_payload: {
        request: requestPayload,
        response: responseMessage,
      },
      status: 'generated',
    });

    return mapRow(created);
  }
}

export const eInvoiceService = new EInvoiceService();
