import { db } from '../database/connection';
import {
  InvoiceDispatch,
  CreateInvoiceDispatchDTO,
  UpdateInvoiceDispatchDTO,
  InvoiceDispatchStatus,
} from '../models/invoice-dispatch.model';
import { logger } from '../utils/logger';

function formatDate(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  if (typeof date === 'string') return date;
  return date.toISOString().split('T')[0];
}

const INVOICE_DISPATCH_SELECT = `
  id, sales_sauda_id, godown_id, internal_invoice_number,
  TO_CHAR(dispatch_date, 'YYYY-MM-DD') as dispatch_date, financial_year,
  party_name, party_address, party_gst_number, party_pan_number, transporter_id, vehicle_id,
  lr_number, transportation_cost, distance_km, route_description, usp, bilti_image_url, bilti_pdf_url,
  status, created_at, updated_at, created_by, updated_by
`;

export class InvoiceDispatchDAO {
  async findAll(
    salesSaudaId?: string,
    status?: InvoiceDispatchStatus,
    godownId?: string,
    financialYear?: string
  ): Promise<InvoiceDispatch[]> {
    let query = `
      SELECT ${INVOICE_DISPATCH_SELECT}
      FROM invoice_dispatches WHERE 1=1
    `;
    const params: any[] = [];
    let n = 1;
    if (salesSaudaId) {
      query += ` AND sales_sauda_id = $${n++}`;
      params.push(salesSaudaId);
    }
    if (status) {
      query += ` AND status = $${n++}`;
      params.push(status);
    }
    if (godownId) {
      query += ` AND godown_id = $${n++}`;
      params.push(godownId);
    }
    if (financialYear) {
      query += ` AND financial_year = $${n++}`;
      params.push(financialYear);
    }
    query += ` ORDER BY created_at DESC`;
    const result = await db.query<InvoiceDispatch>(query, params);
    return result.rows;
  }

  async findById(id: string): Promise<InvoiceDispatch | null> {
    const query = `
      SELECT ${INVOICE_DISPATCH_SELECT}
      FROM invoice_dispatches WHERE id = $1
    `;
    const result = await db.query<InvoiceDispatch>(query, [id]);
    return result.rows[0] || null;
  }

  async create(data: CreateInvoiceDispatchDTO): Promise<InvoiceDispatch> {
    const query = `
      INSERT INTO invoice_dispatches (
        sales_sauda_id, godown_id, internal_invoice_number, dispatch_date, financial_year,
        party_name, party_address, party_gst_number, party_pan_number,
        transporter_id, vehicle_id, lr_number, transportation_cost, distance_km, route_description, usp,
        status, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'draft', $17)
      RETURNING ${INVOICE_DISPATCH_SELECT}
    `;
    const values = [
      data.sales_sauda_id,
      data.godown_id,
      data.internal_invoice_number,
      data.dispatch_date != null
        ? formatDate(
            typeof data.dispatch_date === 'string' ? data.dispatch_date : (data.dispatch_date as Date)
          )
        : null,
      data.financial_year,
      data.party_name,
      data.party_address ?? null,
      data.party_gst_number ?? null,
      data.party_pan_number ?? null,
      data.transporter_id ?? null,
      data.vehicle_id ?? null,
      data.lr_number != null && String(data.lr_number).trim() !== ''
        ? String(data.lr_number).trim()
        : null,
      data.transportation_cost ?? null,
      data.distance_km ?? null,
      data.route_description ?? null,
      data.usp != null && String(data.usp).trim() !== '' ? String(data.usp).trim() : null,
      data.created_by ?? null,
    ];
    const result = await db.query<InvoiceDispatch>(query, values);
    logger.info('Invoice dispatch created', {
      id: result.rows[0].id,
      financialYear: data.financial_year,
    });
    return result.rows[0];
  }

  async updateStatus(
    id: string,
    status: InvoiceDispatchStatus,
    updatedBy?: string
  ): Promise<InvoiceDispatch | null> {
    const query = `
      UPDATE invoice_dispatches SET status = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $2
      WHERE id = $3
      RETURNING ${INVOICE_DISPATCH_SELECT}
    `;
    const result = await db.query<InvoiceDispatch>(query, [status, updatedBy ?? null, id]);
    return result.rows[0] || null;
  }

  async update(id: string, data: UpdateInvoiceDispatchDTO): Promise<InvoiceDispatch | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let n = 1;

    if (data.bilti_image_url !== undefined) {
      fields.push(`bilti_image_url = $${n++}`);
      values.push(data.bilti_image_url || null);
    }
    if (data.bilti_pdf_url !== undefined) {
      fields.push(`bilti_pdf_url = $${n++}`);
      values.push(data.bilti_pdf_url || null);
    }
    if (data.transportation_cost !== undefined) {
      fields.push(`transportation_cost = $${n++}`);
      values.push(data.transportation_cost ?? null);
    }
    if (data.lr_number !== undefined) {
      fields.push(`lr_number = $${n++}`);
      values.push(
        data.lr_number != null && String(data.lr_number).trim() !== ''
          ? String(data.lr_number).trim()
          : null
      );
    }
    if (data.updated_by !== undefined) {
      fields.push(`updated_by = $${n++}`);
      values.push(data.updated_by);
    }

    if (fields.length === 0) return this.findById(id);

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const query = `
      UPDATE invoice_dispatches SET ${fields.join(', ')}
      WHERE id = $${n}
      RETURNING ${INVOICE_DISPATCH_SELECT}
    `;
    const result = await db.query<InvoiceDispatch>(query, values);
    if (result.rows.length === 0) return null;
    logger.info('Invoice dispatch updated', { id });
    return result.rows[0];
  }
}

export const invoiceDispatchDAO = new InvoiceDispatchDAO();
