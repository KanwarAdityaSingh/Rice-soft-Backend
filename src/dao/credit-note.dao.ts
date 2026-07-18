import { db } from '../database/connection';
import { CreditNote, CreateCreditNoteDTO, CreditNoteStatus } from '../models/credit-note.model';
import { logger } from '../utils/logger';

function formatDate(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  if (typeof date === 'string') return date;
  return date.toISOString().split('T')[0];
}

const CREDIT_NOTE_SELECT = `
  id, invoice_dispatch_id, sales_sauda_id, credit_note_number,
  TO_CHAR(credit_note_date, 'YYYY-MM-DD') as credit_note_date, financial_year,
  status, reason, created_at, updated_at, created_by, updated_by
`;

export class CreditNoteDAO {
  async findAll(
    invoiceDispatchId?: string,
    status?: CreditNoteStatus,
    financialYear?: string
  ): Promise<CreditNote[]> {
    let query = `
      SELECT ${CREDIT_NOTE_SELECT}
      FROM credit_notes WHERE 1=1
    `;
    const params: any[] = [];
    let n = 1;
    if (invoiceDispatchId) {
      query += ` AND invoice_dispatch_id = $${n++}`;
      params.push(invoiceDispatchId);
    }
    if (status) {
      query += ` AND status = $${n++}`;
      params.push(status);
    }
    if (financialYear) {
      query += ` AND financial_year = $${n++}`;
      params.push(financialYear);
    }
    query += ` ORDER BY created_at DESC`;
    const result = await db.query<CreditNote>(query, params);
    return result.rows;
  }

  async findById(id: string): Promise<CreditNote | null> {
    const query = `
      SELECT ${CREDIT_NOTE_SELECT}
      FROM credit_notes WHERE id = $1
    `;
    const result = await db.query<CreditNote>(query, [id]);
    return result.rows[0] || null;
  }

  async create(data: Omit<CreateCreditNoteDTO, 'lines'>): Promise<CreditNote> {
    const query = `
      INSERT INTO credit_notes (
        invoice_dispatch_id, sales_sauda_id, credit_note_number, credit_note_date,
        financial_year, status, reason, created_by
      )
      VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7)
      RETURNING ${CREDIT_NOTE_SELECT}
    `;
    const values = [
      data.invoice_dispatch_id,
      data.sales_sauda_id,
      data.credit_note_number,
      data.credit_note_date != null
        ? formatDate(
            typeof data.credit_note_date === 'string'
              ? data.credit_note_date
              : (data.credit_note_date as Date)
          )
        : null,
      data.financial_year,
      data.reason ?? null,
      data.created_by ?? null,
    ];
    const result = await db.query<CreditNote>(query, values);
    logger.info('Credit note created', {
      id: result.rows[0].id,
      financialYear: data.financial_year,
    });
    return result.rows[0];
  }

  async updateStatus(
    id: string,
    status: CreditNoteStatus,
    updatedBy?: string
  ): Promise<CreditNote | null> {
    const query = `
      UPDATE credit_notes SET status = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $2 WHERE id = $3
      RETURNING ${CREDIT_NOTE_SELECT}
    `;
    const result = await db.query<CreditNote>(query, [status, updatedBy ?? null, id]);
    return result.rows[0] || null;
  }
}

export const creditNoteDAO = new CreditNoteDAO();
