import { PoolClient } from 'pg';
import { db } from '../database/connection';
import {
  InvoiceDispatch,
  CreateInvoiceDispatchDTO,
  UpdateInvoiceDispatchDTO,
  InvoiceDispatchStatus,
} from '../models/invoice-dispatch.model';
import { logger } from '../utils/logger';
import { buildNormalizedSearchClause } from '../utils/search';
import { DISPATCH_DOCUMENT_GRACE_DAYS } from '../constants/invoice-dispatch-documents';

function formatDate(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  if (typeof date === 'string') return date;
  return date.toISOString().split('T')[0];
}

const INVOICE_DISPATCH_SELECT = `
  id, sales_sauda_id, godown_id, to_godown_id, serial_number, internal_invoice_number,
  TO_CHAR(dispatch_date, 'YYYY-MM-DD') as dispatch_date, financial_year,
  party_name, party_address, party_gst_number, party_pan_number, transporter_id, vehicle_id,
  driver_id, lr_number, transportation_cost, distance_km, route_description, usp, bilti_image_url, bilti_pdf_url,
  lr_image_url, lr_pdf_url, receiving_doc_image_url, receiving_doc_pdf_url,
  status, bos_verification_token,
  bos_verification_token_created_at,
  document_compliance_required,
  cancel_reason, created_at, updated_at, created_by, updated_by
`;

export class InvoiceDispatchDAO {
  async findAll(
    salesSaudaId?: string,
    status?: InvoiceDispatchStatus,
    godownId?: string,
    financialYear?: string,
    pagination?: { limit: number; offset: number },
    search?: string
  ): Promise<{ rows: InvoiceDispatch[]; total: number }> {
    let where = ` WHERE 1=1`;
    const params: any[] = [];
    let n = 1;
    if (salesSaudaId) {
      where += ` AND (
        sales_sauda_id = $${n}
        OR EXISTS (
          SELECT 1 FROM invoice_dispatch_saudas ids
          WHERE ids.invoice_dispatch_id = invoice_dispatches.id
            AND ids.sales_sauda_id = $${n}
        )
      )`;
      params.push(salesSaudaId);
      n++;
    }
    if (status) {
      where += ` AND status = $${n++}`;
      params.push(status);
    }
    if (godownId) {
      where += ` AND godown_id = $${n++}`;
      params.push(godownId);
    }
    if (financialYear) {
      where += ` AND financial_year = $${n++}`;
      params.push(financialYear);
    }

    const searchClause = buildNormalizedSearchClause(
      [
        'serial_number',
        'internal_invoice_number',
        'party_name',
        'party_gst_number',
        'lr_number',
      ],
      search,
      n
    );
    where += searchClause.sql;
    params.push(...searchClause.params);
    n = searchClause.nextParamIndex;

    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM invoice_dispatches${where}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const limit = pagination?.limit ?? 50;
    const offset = pagination?.offset ?? 0;
    const result = await db.query<InvoiceDispatch>(
      `SELECT ${INVOICE_DISPATCH_SELECT}
       FROM invoice_dispatches
       ${where}
       ORDER BY serial_number DESC NULLS LAST, created_at DESC
       LIMIT $${n++} OFFSET $${n}`,
      [...params, limit, offset]
    );
    return { rows: result.rows, total };
  }

  async findById(id: string): Promise<InvoiceDispatch | null> {
    const query = `
      SELECT ${INVOICE_DISPATCH_SELECT}
      FROM invoice_dispatches WHERE id = $1
    `;
    const result = await db.query<InvoiceDispatch>(query, [id]);
    return result.rows[0] || null;
  }

  async findByBosVerificationToken(token: string): Promise<InvoiceDispatch | null> {
    const query = `
      SELECT ${INVOICE_DISPATCH_SELECT}
      FROM invoice_dispatches
      WHERE bos_verification_token = $1
    `;
    const result = await db.query<InvoiceDispatch>(query, [token]);
    return result.rows[0] || null;
  }

  async assignBosVerificationToken(
    id: string,
    token: string,
    client?: PoolClient,
  ): Promise<void> {
    const query = `
      UPDATE invoice_dispatches
      SET bos_verification_token = $1,
          bos_verification_token_created_at = COALESCE(bos_verification_token_created_at, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
        AND bos_verification_token IS NULL
    `;
    if (client) {
      await client.query(query, [token, id]);
    } else {
      await db.query(query, [token, id]);
    }
  }

  async create(
    data: CreateInvoiceDispatchDTO,
    client?: PoolClient
  ): Promise<InvoiceDispatch> {
    const query = `
      INSERT INTO invoice_dispatches (
        sales_sauda_id, godown_id, to_godown_id, internal_invoice_number, dispatch_date, financial_year,
        party_name, party_address, party_gst_number, party_pan_number,
        transporter_id, vehicle_id, driver_id, lr_number, transportation_cost, distance_km, route_description, usp,
        status, document_compliance_required, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'draft', true, $19)
      RETURNING ${INVOICE_DISPATCH_SELECT}
    `;
    const values = [
      data.sales_sauda_id,
      data.godown_id,
      data.to_godown_id ?? null,
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
      data.driver_id ?? null,
      data.lr_number != null && String(data.lr_number).trim() !== ''
        ? String(data.lr_number).trim()
        : null,
      data.transportation_cost ?? null,
      data.distance_km ?? null,
      data.route_description ?? null,
      data.usp != null && String(data.usp).trim() !== '' ? String(data.usp).trim() : null,
      data.created_by ?? null,
    ];
    const result = client
      ? await client.query<InvoiceDispatch>(query, values)
      : await db.query<InvoiceDispatch>(query, values);
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

    if (data.dispatch_date !== undefined) {
      fields.push(`dispatch_date = $${n++}`);
      values.push(
        data.dispatch_date != null && String(data.dispatch_date).trim() !== ''
          ? formatDate(
              typeof data.dispatch_date === 'string'
                ? data.dispatch_date
                : (data.dispatch_date as Date)
            )
          : null
      );
    }
    if (data.transporter_id !== undefined) {
      fields.push(`transporter_id = $${n++}`);
      values.push(data.transporter_id || null);
    }
    if (data.vehicle_id !== undefined) {
      fields.push(`vehicle_id = $${n++}`);
      values.push(data.vehicle_id || null);
    }
    if (data.driver_id !== undefined) {
      fields.push(`driver_id = $${n++}`);
      values.push(data.driver_id || null);
    }
    if (data.distance_km !== undefined) {
      fields.push(`distance_km = $${n++}`);
      values.push(data.distance_km ?? null);
    }
    if (data.route_description !== undefined) {
      fields.push(`route_description = $${n++}`);
      values.push(
        data.route_description != null && String(data.route_description).trim() !== ''
          ? String(data.route_description).trim()
          : null
      );
    }
    if (data.usp !== undefined) {
      fields.push(`usp = $${n++}`);
      values.push(
        data.usp != null && String(data.usp).trim() !== '' ? String(data.usp).trim() : null
      );
    }
    if (data.bilti_image_url !== undefined) {
      fields.push(`bilti_image_url = $${n++}`);
      values.push(data.bilti_image_url || null);
    }
    if (data.bilti_pdf_url !== undefined) {
      fields.push(`bilti_pdf_url = $${n++}`);
      values.push(data.bilti_pdf_url || null);
    }
    if (data.lr_image_url !== undefined) {
      fields.push(`lr_image_url = $${n++}`);
      values.push(data.lr_image_url || null);
    }
    if (data.lr_pdf_url !== undefined) {
      fields.push(`lr_pdf_url = $${n++}`);
      values.push(data.lr_pdf_url || null);
    }
    if (data.receiving_doc_image_url !== undefined) {
      fields.push(`receiving_doc_image_url = $${n++}`);
      values.push(data.receiving_doc_image_url || null);
    }
    if (data.receiving_doc_pdf_url !== undefined) {
      fields.push(`receiving_doc_pdf_url = $${n++}`);
      values.push(data.receiving_doc_pdf_url || null);
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
    if (data.cancel_reason !== undefined) {
      fields.push(`cancel_reason = $${n++}`);
      values.push(
        data.cancel_reason != null && String(data.cancel_reason).trim() !== ''
          ? String(data.cancel_reason).trim()
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

  async delete(id: string): Promise<boolean> {
    const result = await db.query('DELETE FROM invoice_dispatches WHERE id = $1', [id]);
    const deleted = (result.rowCount ?? 0) > 0;
    if (deleted) {
      logger.info('Invoice dispatch deleted', { id });
    }
    return deleted;
  }

  /**
   * Confirmed sale invoices past the 3-day IST grace with neither receiving
   * nor bilti/LR uploaded. Either file clears the next-invoice gate.
   */
  async findOverdueDocumentDispatches(): Promise<InvoiceDispatch[]> {
    const result = await db.query<InvoiceDispatch>(
      `SELECT ${INVOICE_DISPATCH_SELECT}
       FROM invoice_dispatches
       WHERE status = 'confirmed'
         AND document_compliance_required = true
         AND distance_km IS NOT NULL
         AND (
           COALESCE(dispatch_date, (created_at AT TIME ZONE 'Asia/Kolkata')::date)
           + ${DISPATCH_DOCUMENT_GRACE_DAYS}
         ) < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
         AND EXISTS (
           SELECT 1 FROM sales_saudas s
           WHERE s.id = invoice_dispatches.sales_sauda_id
             AND s.movement_type = 'sale'
         )
         AND receiving_doc_image_url IS NULL
         AND receiving_doc_pdf_url IS NULL
         AND bilti_image_url IS NULL
         AND bilti_pdf_url IS NULL
         AND lr_image_url IS NULL
         AND lr_pdf_url IS NULL
       ORDER BY dispatch_date ASC NULLS FIRST, serial_number ASC
       LIMIT 50`
    );
    return result.rows;
  }
}

export const invoiceDispatchDAO = new InvoiceDispatchDAO();
