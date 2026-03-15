import { db } from '../database/connection';
import { InvoiceDispatchLine } from '../models/invoice-dispatch-line.model';

export interface CreateInvoiceDispatchLineDTO {
  invoice_dispatch_id: string;
  sales_sauda_line_id?: string | null;
  product_id: string;
  packaging_id?: string | null;
  quantity: number;
  quantity_unit: string;
  rate: number;
  amount: number;
}

export class InvoiceDispatchLineDAO {
  async findByInvoiceDispatchId(invoiceDispatchId: string): Promise<InvoiceDispatchLine[]> {
    const query = `
      SELECT id, invoice_dispatch_id, sales_sauda_line_id, product_id, packaging_id, quantity, quantity_unit, rate, amount, created_at, updated_at
      FROM invoice_dispatch_lines WHERE invoice_dispatch_id = $1 ORDER BY id
    `;
    const result = await db.query<InvoiceDispatchLine>(query, [invoiceDispatchId]);
    return result.rows;
  }

  async create(data: CreateInvoiceDispatchLineDTO): Promise<InvoiceDispatchLine> {
    const query = `
      INSERT INTO invoice_dispatch_lines (invoice_dispatch_id, sales_sauda_line_id, product_id, packaging_id, quantity, quantity_unit, rate, amount)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, invoice_dispatch_id, sales_sauda_line_id, product_id, packaging_id, quantity, quantity_unit, rate, amount, created_at, updated_at
    `;
    const values = [
      data.invoice_dispatch_id,
      data.sales_sauda_line_id ?? null,
      data.product_id,
      data.packaging_id ?? null,
      data.quantity,
      data.quantity_unit,
      data.rate,
      data.amount,
    ];
    const result = await db.query<InvoiceDispatchLine>(query, values);
    return result.rows[0];
  }
}

export const invoiceDispatchLineDAO = new InvoiceDispatchLineDAO();
