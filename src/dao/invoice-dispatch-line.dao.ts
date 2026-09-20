import { PoolClient } from 'pg';
import { db } from '../database/connection';
import { InvoiceDispatchLine } from '../models/invoice-dispatch-line.model';

export interface CreateInvoiceDispatchLineDTO {
  invoice_dispatch_id: string;
  sales_sauda_line_id?: string | null;
  product_id?: string | null;
  product_alias?: string | null;
  lot_id?: string | null;
  packaging_id?: string | null;
  packet_count?: number | null;
  no_of_bags?: number | null;
  bag_weight?: number | null;
  quantity: number;
  quantity_unit: string;
  rate: number;
  amount: number;
}

const DISPATCH_LINE_SELECT = `
  id, invoice_dispatch_id, sales_sauda_line_id, product_id, product_alias, lot_id, packaging_id, packet_count,
  no_of_bags, bag_weight, quantity, quantity_unit, rate, amount, created_at, updated_at
`;

export class InvoiceDispatchLineDAO {
  async findByInvoiceDispatchId(invoiceDispatchId: string): Promise<InvoiceDispatchLine[]> {
    const query = `
      SELECT ${DISPATCH_LINE_SELECT}
      FROM invoice_dispatch_lines WHERE invoice_dispatch_id = $1 ORDER BY id
    `;
    const result = await db.query<InvoiceDispatchLine>(query, [invoiceDispatchId]);
    return result.rows;
  }

  async findById(id: string): Promise<InvoiceDispatchLine | null> {
    const query = `SELECT ${DISPATCH_LINE_SELECT} FROM invoice_dispatch_lines WHERE id = $1`;
    const result = await db.query<InvoiceDispatchLine>(query, [id]);
    return result.rows[0] || null;
  }

  async create(
    data: CreateInvoiceDispatchLineDTO,
    client?: PoolClient
  ): Promise<InvoiceDispatchLine> {
    const productAlias =
      data.product_alias != null && String(data.product_alias).trim() !== ''
        ? String(data.product_alias).trim()
        : null;
    const query = `
      INSERT INTO invoice_dispatch_lines (
        invoice_dispatch_id, sales_sauda_line_id, product_id, product_alias, lot_id, packaging_id, packet_count,
        no_of_bags, bag_weight, quantity, quantity_unit, rate, amount
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING ${DISPATCH_LINE_SELECT}
    `;
    const values = [
      data.invoice_dispatch_id,
      data.sales_sauda_line_id ?? null,
      data.product_id ?? null,
      productAlias,
      data.lot_id ?? null,
      data.packaging_id ?? null,
      data.packet_count ?? null,
      data.no_of_bags ?? null,
      data.bag_weight ?? null,
      data.quantity,
      data.quantity_unit,
      data.rate,
      data.amount,
    ];
    const result = client
      ? await client.query<InvoiceDispatchLine>(query, values)
      : await db.query<InvoiceDispatchLine>(query, values);
    return result.rows[0];
  }
}

export const invoiceDispatchLineDAO = new InvoiceDispatchLineDAO();
