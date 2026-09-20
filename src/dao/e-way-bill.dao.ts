import { db } from '../database/connection';
import { EWayBill, CreateEWayBillDTO, CancelEWayBillDTO } from '../models/e-way-bill.model';

const EWAY_BILL_COLUMNS = `
  id, invoice_dispatch_id, credit_note_id, eway_bill_number, vehicle_number, distance_km, route,
  transporter_id, payload, status, cancelled_at, cancel_reason, cancel_remark, created_at, updated_at
`;

export class EWayBillDAO {
  async create(data: CreateEWayBillDTO): Promise<EWayBill> {
    const query = `
      INSERT INTO e_way_bills (invoice_dispatch_id, credit_note_id, eway_bill_number, vehicle_number, distance_km, route, transporter_id, payload)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING ${EWAY_BILL_COLUMNS}
    `;
    const values = [
      data.invoice_dispatch_id ?? null,
      data.credit_note_id ?? null,
      data.eway_bill_number ?? null,
      data.vehicle_number ?? null,
      data.distance_km ?? null,
      data.route ?? null,
      data.transporter_id ?? null,
      data.payload ?? null,
    ];
    const result = await db.query<EWayBill>(query, values);
    return result.rows[0];
  }

  async findByInvoiceDispatchId(invoiceDispatchId: string): Promise<EWayBill[]> {
    const result = await db.query<EWayBill>(
      `SELECT ${EWAY_BILL_COLUMNS} FROM e_way_bills WHERE invoice_dispatch_id = $1 ORDER BY created_at DESC`,
      [invoiceDispatchId]
    );
    return result.rows;
  }

  /** Latest e-way bill per dispatch id (one row each). Missing ids are omitted. */
  async findLatestByInvoiceDispatchIds(invoiceDispatchIds: string[]): Promise<EWayBill[]> {
    if (invoiceDispatchIds.length === 0) return [];
    const result = await db.query<EWayBill>(
      `SELECT DISTINCT ON (invoice_dispatch_id) ${EWAY_BILL_COLUMNS}
       FROM e_way_bills
       WHERE invoice_dispatch_id = ANY($1::uuid[])
       ORDER BY invoice_dispatch_id, created_at DESC`,
      [invoiceDispatchIds]
    );
    return result.rows;
  }

  async markCancelled(id: string, data: CancelEWayBillDTO): Promise<EWayBill> {
    const result = await db.query<EWayBill>(
      `UPDATE e_way_bills
       SET status = 'cancelled',
           cancelled_at = COALESCE(cancelled_at, CURRENT_TIMESTAMP),
           cancel_reason = $2,
           cancel_remark = $3,
           payload = COALESCE($4::jsonb, payload),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING ${EWAY_BILL_COLUMNS}`,
      [id, data.cancel_reason, data.cancel_remark, data.payload ? JSON.stringify(data.payload) : null]
    );
    return result.rows[0];
  }
}

export const eWayBillDAO = new EWayBillDAO();
