import { PoolClient } from 'pg';
import { db } from '../database/connection';
import { CreditNoteLine, CreateCreditNoteLineDTO } from '../models/credit-note-line.model';

const LINE_SELECT = `
  id, credit_note_id, invoice_dispatch_line_id, product_id,
  product_alias, brand, hsn_code,
  quantity_returned, quantity_credited, quantity_invoiced,
  quantity_actual_returned, quantity_verified, quantity_short,
  original_rate, corrected_rate, credit_taxable_input,
  rate, gst_percent, discount_value, discount_type,
  taxable_amount, cgst_amount, sgst_amount, igst_amount, final_amount,
  created_at, updated_at
`;

export class CreditNoteLineDAO {
  async findByCreditNoteId(
    creditNoteId: string,
    client?: PoolClient
  ): Promise<CreditNoteLine[]> {
    const query = `
      SELECT ${LINE_SELECT}
      FROM credit_note_lines WHERE credit_note_id = $1 ORDER BY id
    `;
    const result = client
      ? await client.query<CreditNoteLine>(query, [creditNoteId])
      : await db.query<CreditNoteLine>(query, [creditNoteId]);
    return result.rows;
  }

  async deleteByCreditNoteId(creditNoteId: string, client?: PoolClient): Promise<void> {
    const query = `DELETE FROM credit_note_lines WHERE credit_note_id = $1`;
    if (client) await client.query(query, [creditNoteId]);
    else await db.query(query, [creditNoteId]);
  }

  async create(data: CreateCreditNoteLineDTO, client?: PoolClient): Promise<CreditNoteLine> {
    const query = `
      INSERT INTO credit_note_lines (
        credit_note_id, invoice_dispatch_line_id, product_id,
        product_alias, brand, hsn_code,
        quantity_returned, quantity_credited, quantity_invoiced,
        quantity_actual_returned, quantity_verified, quantity_short,
        original_rate, corrected_rate, credit_taxable_input,
        rate, gst_percent, discount_value, discount_type,
        taxable_amount, cgst_amount, sgst_amount, igst_amount, final_amount
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22, $23, $24
      )
      RETURNING ${LINE_SELECT}
    `;
    const values = [
      data.credit_note_id,
      data.invoice_dispatch_line_id,
      data.product_id ?? null,
      data.product_alias ?? null,
      data.brand ?? null,
      data.hsn_code ?? null,
      data.quantity_returned,
      data.quantity_credited,
      data.quantity_invoiced ?? null,
      data.quantity_actual_returned ?? null,
      data.quantity_verified ?? null,
      data.quantity_short ?? null,
      data.original_rate ?? null,
      data.corrected_rate ?? null,
      data.credit_taxable_input ?? null,
      data.rate ?? null,
      data.gst_percent ?? null,
      data.discount_value ?? null,
      data.discount_type ?? null,
      data.taxable_amount,
      data.cgst_amount,
      data.sgst_amount,
      data.igst_amount,
      data.final_amount,
    ];
    const result = client
      ? await client.query<CreditNoteLine>(query, values)
      : await db.query<CreditNoteLine>(query, values);
    return result.rows[0];
  }
}

export const creditNoteLineDAO = new CreditNoteLineDAO();
