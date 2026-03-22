import { db } from '../database/connection';
import {
  InvoiceDispatch,
  CreateInvoiceDispatchDTO,
  InvoiceDispatchStatus,
} from '../models/invoice-dispatch.model';
import { logger } from '../utils/logger';

function formatDate(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  if (typeof date === 'string') return date;
  return date.toISOString().split('T')[0];
}

export class InvoiceDispatchDAO {
  async findAll(salesSaudaId?: string, status?: InvoiceDispatchStatus, godownId?: string): Promise<InvoiceDispatch[]> {
    let query = `
      SELECT id, sales_sauda_id, godown_id, internal_invoice_number, TO_CHAR(dispatch_date, 'YYYY-MM-DD') as dispatch_date,
             party_name, party_address, party_gst_number, party_pan_number, transporter_id, vehicle_id,
             distance_km, route_description, status, created_at, updated_at, created_by, updated_by
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
    query += ` ORDER BY created_at DESC`;
    const result = await db.query<InvoiceDispatch>(query, params);
    return result.rows;
  }

  async findById(id: string): Promise<InvoiceDispatch | null> {
    const query = `
      SELECT id, sales_sauda_id, godown_id, internal_invoice_number, TO_CHAR(dispatch_date, 'YYYY-MM-DD') as dispatch_date,
             party_name, party_address, party_gst_number, party_pan_number, transporter_id, vehicle_id,
             distance_km, route_description, status, created_at, updated_at, created_by, updated_by
      FROM invoice_dispatches WHERE id = $1
    `;
    const result = await db.query<InvoiceDispatch>(query, [id]);
    return result.rows[0] || null;
  }

  async create(data: CreateInvoiceDispatchDTO): Promise<InvoiceDispatch> {
    const query = `
      INSERT INTO invoice_dispatches (sales_sauda_id, godown_id, internal_invoice_number, dispatch_date, party_name, party_address,
        party_gst_number, party_pan_number, transporter_id, vehicle_id, distance_km, route_description, status, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'draft', $13)
      RETURNING id, sales_sauda_id, godown_id, internal_invoice_number, TO_CHAR(dispatch_date, 'YYYY-MM-DD') as dispatch_date,
                party_name, party_address, party_gst_number, party_pan_number, transporter_id, vehicle_id,
                distance_km, route_description, status, created_at, updated_at, created_by, updated_by
    `;
    const values = [
      data.sales_sauda_id,
      data.godown_id,
      data.internal_invoice_number,
      data.dispatch_date != null ? formatDate(typeof data.dispatch_date === 'string' ? data.dispatch_date : (data.dispatch_date as Date)) : null,
      data.party_name,
      data.party_address ?? null,
      data.party_gst_number ?? null,
      data.party_pan_number ?? null,
      data.transporter_id ?? null,
      data.vehicle_id ?? null,
      data.distance_km ?? null,
      data.route_description ?? null,
      data.created_by ?? null,
    ];
    const result = await db.query<InvoiceDispatch>(query, values);
    logger.info('Invoice dispatch created', { id: result.rows[0].id });
    return result.rows[0];
  }

  async updateStatus(id: string, status: InvoiceDispatchStatus, updatedBy?: string): Promise<InvoiceDispatch | null> {
    const query = `
      UPDATE invoice_dispatches SET status = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $2
      WHERE id = $3
      RETURNING id, sales_sauda_id, godown_id, internal_invoice_number, TO_CHAR(dispatch_date, 'YYYY-MM-DD') as dispatch_date,
                party_name, party_address, party_gst_number, party_pan_number, transporter_id, vehicle_id,
                distance_km, route_description, status, created_at, updated_at, created_by, updated_by
    `;
    const result = await db.query<InvoiceDispatch>(query, [status, updatedBy ?? null, id]);
    return result.rows[0] || null;
  }
}

export const invoiceDispatchDAO = new InvoiceDispatchDAO();
