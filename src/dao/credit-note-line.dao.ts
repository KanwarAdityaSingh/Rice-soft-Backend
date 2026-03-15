import { db } from '../database/connection';
import { CreditNoteLine } from '../models/credit-note-line.model';

export class CreditNoteLineDAO {
  async findByCreditNoteId(creditNoteId: string): Promise<CreditNoteLine[]> {
    const result = await db.query<CreditNoteLine>(
      `SELECT id, credit_note_id, invoice_dispatch_line_id, product_id, quantity_returned, created_at, updated_at
       FROM credit_note_lines WHERE credit_note_id = $1 ORDER BY id`,
      [creditNoteId]
    );
    return result.rows;
  }

  async create(data: {
    credit_note_id: string;
    invoice_dispatch_line_id: string;
    product_id: string;
    quantity_returned: number;
  }): Promise<CreditNoteLine> {
    const result = await db.query<CreditNoteLine>(
      `INSERT INTO credit_note_lines (credit_note_id, invoice_dispatch_line_id, product_id, quantity_returned)
       VALUES ($1, $2, $3, $4)
       RETURNING id, credit_note_id, invoice_dispatch_line_id, product_id, quantity_returned, created_at, updated_at`,
      [data.credit_note_id, data.invoice_dispatch_line_id, data.product_id, data.quantity_returned]
    );
    return result.rows[0];
  }
}

export const creditNoteLineDAO = new CreditNoteLineDAO();
