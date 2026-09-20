import { PoolClient } from 'pg';
import { db } from '../database/connection';

export interface CreateInvoiceDispatchLotAllocationDTO {
  invoice_dispatch_id: string;
  invoice_dispatch_line_id: string;
  lot_id: string;
  lot_inventory_id: string;
  quantity_deducted: number;
}

export interface InvoiceDispatchLotAllocation {
  id: string;
  invoice_dispatch_id: string;
  invoice_dispatch_line_id: string;
  lot_id: string;
  lot_inventory_id: string;
  quantity_deducted: number;
}

export class InvoiceDispatchLotAllocationDAO {
  async create(
    data: CreateInvoiceDispatchLotAllocationDTO,
    client?: PoolClient
  ): Promise<{ id: string }> {
    const query = `
      INSERT INTO invoice_dispatch_lot_allocations (
        invoice_dispatch_id, invoice_dispatch_line_id, lot_id, lot_inventory_id, quantity_deducted
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `;
    const values = [
      data.invoice_dispatch_id,
      data.invoice_dispatch_line_id,
      data.lot_id,
      data.lot_inventory_id,
      data.quantity_deducted,
    ];
    const result = client
      ? await client.query(query, values)
      : await db.query(query, values);
    return result.rows[0];
  }

  async findByInvoiceDispatchLineId(
    invoiceDispatchLineId: string,
    client?: PoolClient
  ): Promise<InvoiceDispatchLotAllocation[]> {
    const query = `
      SELECT id, invoice_dispatch_id, invoice_dispatch_line_id, lot_id, lot_inventory_id, quantity_deducted
      FROM invoice_dispatch_lot_allocations
      WHERE invoice_dispatch_line_id = $1
      ORDER BY id DESC
    `;
    const result = client
      ? await client.query<InvoiceDispatchLotAllocation>(query, [invoiceDispatchLineId])
      : await db.query<InvoiceDispatchLotAllocation>(query, [invoiceDispatchLineId]);
    return result.rows;
  }

  async findByInvoiceDispatchId(
    invoiceDispatchId: string,
    client?: PoolClient
  ): Promise<InvoiceDispatchLotAllocation[]> {
    const query = `
      SELECT id, invoice_dispatch_id, invoice_dispatch_line_id, lot_id, lot_inventory_id, quantity_deducted
      FROM invoice_dispatch_lot_allocations
      WHERE invoice_dispatch_id = $1
      ORDER BY id ASC
    `;
    const result = client
      ? await client.query<InvoiceDispatchLotAllocation>(query, [invoiceDispatchId])
      : await db.query<InvoiceDispatchLotAllocation>(query, [invoiceDispatchId]);
    return result.rows;
  }
}

export const invoiceDispatchLotAllocationDAO = new InvoiceDispatchLotAllocationDAO();
