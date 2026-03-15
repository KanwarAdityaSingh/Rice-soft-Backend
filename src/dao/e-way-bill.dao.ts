import { db } from '../database/connection';
import { EWayBill, CreateEWayBillDTO } from '../models/e-way-bill.model';

export class EWayBillDAO {
  async create(data: CreateEWayBillDTO): Promise<EWayBill> {
    const query = `
      INSERT INTO e_way_bills (invoice_dispatch_id, credit_note_id, eway_bill_number, vehicle_number, distance_km, route, transporter_id, payload)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, invoice_dispatch_id, credit_note_id, eway_bill_number, vehicle_number, distance_km, route, transporter_id, payload, created_at, updated_at
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
      'SELECT * FROM e_way_bills WHERE invoice_dispatch_id = $1 ORDER BY created_at DESC',
      [invoiceDispatchId]
    );
    return result.rows;
  }
}

export const eWayBillDAO = new EWayBillDAO();
