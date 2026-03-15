import { db } from '../database/connection';
import { EInvoice, CreateEInvoiceDTO } from '../models/e-invoice.model';

export class EInvoiceDAO {
  async findByInvoiceDispatchId(invoiceDispatchId: string): Promise<EInvoice | null> {
    const query = `
      SELECT id, invoice_dispatch_id, irn, acknowledgement_number, ack_date, qr_code_content,
             government_response_payload, status, created_at, updated_at
      FROM e_invoices WHERE invoice_dispatch_id = $1
    `;
    const result = await db.query<EInvoice>(query, [invoiceDispatchId]);
    return result.rows[0] || null;
  }

  async create(data: CreateEInvoiceDTO): Promise<EInvoice> {
    const query = `
      INSERT INTO e_invoices (invoice_dispatch_id, irn, acknowledgement_number, ack_date, qr_code_content, government_response_payload, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, invoice_dispatch_id, irn, acknowledgement_number, ack_date, qr_code_content, government_response_payload, status, created_at, updated_at
    `;
    const values = [
      data.invoice_dispatch_id,
      data.irn,
      data.acknowledgement_number ?? null,
      data.ack_date ?? null,
      data.qr_code_content ?? null,
      data.government_response_payload ?? null,
      data.status ?? 'generated',
    ];
    const result = await db.query<EInvoice>(query, values);
    return result.rows[0];
  }
}

export const eInvoiceDAO = new EInvoiceDAO();
