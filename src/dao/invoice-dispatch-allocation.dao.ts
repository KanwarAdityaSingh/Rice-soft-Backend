import { db } from '../database/connection';
import { PoolClient } from 'pg';

export interface CreateInvoiceDispatchAllocationDTO {
  invoice_dispatch_id: string;
  invoice_dispatch_line_id: string;
  finished_goods_inventory_id: string;
  quantity_deducted: number;
}

export class InvoiceDispatchAllocationDAO {
  async create(
    data: CreateInvoiceDispatchAllocationDTO,
    client?: PoolClient
  ): Promise<{ id: string }> {
    const query = `
      INSERT INTO invoice_dispatch_allocations (invoice_dispatch_id, invoice_dispatch_line_id, finished_goods_inventory_id, quantity_deducted)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `;
    const values = [
      data.invoice_dispatch_id,
      data.invoice_dispatch_line_id,
      data.finished_goods_inventory_id,
      data.quantity_deducted,
    ];
    const result = client
      ? await client.query(query, values)
      : await db.query(query, values);
    return result.rows[0];
  }

  async findByInvoiceDispatchLineId(invoiceDispatchLineId: string): Promise<Array<{ id: string; finished_goods_inventory_id: string; quantity_deducted: number }>> {
    const result = await db.query<{ id: string; finished_goods_inventory_id: string; quantity_deducted: number }>(
      `SELECT id, finished_goods_inventory_id, quantity_deducted FROM invoice_dispatch_allocations WHERE invoice_dispatch_line_id = $1 ORDER BY id DESC`,
      [invoiceDispatchLineId]
    );
    return result.rows;
  }
}

export const invoiceDispatchAllocationDAO = new InvoiceDispatchAllocationDAO();
