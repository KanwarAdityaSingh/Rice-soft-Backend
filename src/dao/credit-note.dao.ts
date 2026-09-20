import { PoolClient } from 'pg';
import { db } from '../database/connection';
import {
  CreditNote,
  CreateCreditNoteHeaderDTO,
  CreditNoteListFilters,
  CreditNoteListRow,
  UpdateCreditNoteHeaderDTO,
} from '../models/credit-note.model';
import { buildNormalizedSearchClause } from '../utils/search';
import { CreditNoteStatus } from '../constants/credit-note';

function formatDate(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  if (typeof date === 'string') return date.slice(0, 10);
  return date.toISOString().split('T')[0];
}

const CREDIT_NOTE_SELECT = `
  cn.id, cn.invoice_dispatch_id, cn.sales_sauda_id, cn.credit_note_number,
  TO_CHAR(cn.credit_note_date, 'YYYY-MM-DD') as credit_note_date, cn.financial_year,
  cn.serial_number, cn.credit_note_type, cn.status, cn.reason, cn.coupon_status,
  cn.material_condition, cn.receiving_godown_id,
  cn.taxable_amount, cn.cgst_amount, cn.sgst_amount, cn.igst_amount, cn.total_credit_amount,
  cn.posted_at, cn.posted_by, cn.cancelled_at, cn.cancelled_by, cn.cancel_reason, cn.edit_reason,
  cn.created_at, cn.updated_at, cn.created_by, cn.updated_by
`;

const LIST_SELECT = `
  ${CREDIT_NOTE_SELECT},
  d.internal_invoice_number AS invoice_number,
  TO_CHAR(d.dispatch_date, 'YYYY-MM-DD') AS invoice_date,
  d.party_name,
  sp.phone AS party_phone
`;

const LIST_FROM = `
  FROM credit_notes cn
  JOIN invoice_dispatches d ON d.id = cn.invoice_dispatch_id
  LEFT JOIN sales_saudas ss ON ss.id = cn.sales_sauda_id
  LEFT JOIN sales_parties sp ON sp.id = ss.sales_party_id
`;

const SORT_COLUMNS: Record<string, string> = {
  credit_note_date: 'cn.credit_note_date',
  credit_note_number: 'cn.credit_note_number',
  total_credit_amount: 'cn.total_credit_amount',
  status: 'cn.status',
  created_at: 'cn.created_at',
  updated_at: 'cn.updated_at',
  party_name: 'd.party_name',
  invoice_number: 'd.internal_invoice_number',
  credit_note_type: 'cn.credit_note_type',
};

export class CreditNoteDAO {
  async findAll(
    filters: CreditNoteListFilters
  ): Promise<{ rows: CreditNoteListRow[]; total: number }> {
    let where = ` WHERE 1=1`;
    const params: unknown[] = [];
    let n = 1;

    if (filters.invoiceDispatchId) {
      where += ` AND cn.invoice_dispatch_id = $${n++}`;
      params.push(filters.invoiceDispatchId);
    }
    if (filters.status) {
      where += ` AND cn.status = $${n++}`;
      params.push(filters.status);
    }
    if (filters.creditNoteType) {
      where += ` AND cn.credit_note_type = $${n++}`;
      params.push(filters.creditNoteType);
    }
    if (filters.financialYear) {
      where += ` AND cn.financial_year = $${n++}`;
      params.push(filters.financialYear);
    }
    if (filters.partyId) {
      where += ` AND ss.sales_party_id = $${n++}`;
      params.push(filters.partyId);
    }
    if (filters.dateFrom) {
      where += ` AND cn.credit_note_date >= $${n++}::date`;
      params.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      where += ` AND cn.credit_note_date <= $${n++}::date`;
      params.push(filters.dateTo);
    }

    const searchClause = buildNormalizedSearchClause(
      [
        'cn.credit_note_number',
        'd.internal_invoice_number',
        'd.party_name',
        'sp.phone',
        'sp.business_name',
      ],
      filters.search,
      n
    );
    where += searchClause.sql;
    params.push(...searchClause.params);
    n = searchClause.nextParamIndex;

    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count ${LIST_FROM}${where}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const sortCol = SORT_COLUMNS[filters.sortBy ?? ''] ?? 'cn.created_at';
    const sortDir = filters.sortDir === 'asc' ? 'ASC' : 'DESC';
    const limit = filters.pagination?.limit ?? 50;
    const offset = filters.pagination?.offset ?? 0;

    const result = await db.query<CreditNoteListRow>(
      `SELECT ${LIST_SELECT}
       ${LIST_FROM}
       ${where}
       ORDER BY ${sortCol} ${sortDir} NULLS LAST, cn.created_at DESC
       LIMIT $${n++} OFFSET $${n}`,
      [...params, limit, offset]
    );
    return { rows: result.rows, total };
  }

  async findById(id: string, client?: PoolClient): Promise<CreditNote | null> {
    const query = `SELECT ${CREDIT_NOTE_SELECT} FROM credit_notes cn WHERE cn.id = $1`;
    const result = client
      ? await client.query<CreditNote>(query, [id])
      : await db.query<CreditNote>(query, [id]);
    return result.rows[0] || null;
  }

  async create(data: CreateCreditNoteHeaderDTO, client?: PoolClient): Promise<CreditNote> {
    const query = `
      INSERT INTO credit_notes (
        invoice_dispatch_id, sales_sauda_id, credit_note_number, credit_note_date,
        financial_year, serial_number, credit_note_type, status, reason, coupon_status,
        material_condition, receiving_godown_id,
        taxable_amount, cgst_amount, sgst_amount, igst_amount, total_credit_amount,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING id
    `;
    const values = [
      data.invoice_dispatch_id,
      data.sales_sauda_id,
      data.credit_note_number,
      formatDate(data.credit_note_date),
      data.financial_year,
      data.serial_number ?? null,
      data.credit_note_type,
      data.reason,
      data.coupon_status,
      data.material_condition ?? null,
      data.receiving_godown_id ?? null,
      data.taxable_amount,
      data.cgst_amount,
      data.sgst_amount,
      data.igst_amount,
      data.total_credit_amount,
      data.created_by ?? null,
    ];
    const inserted = client
      ? await client.query<{ id: string }>(query, values)
      : await db.query<{ id: string }>(query, values);
    const created = await this.findById(inserted.rows[0].id, client);
    if (!created) throw new Error('Failed to load credit note after create');
    return created;
  }

  async updateHeader(
    id: string,
    data: UpdateCreditNoteHeaderDTO,
    client?: PoolClient
  ): Promise<CreditNote | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let n = 1;
    const set = (col: string, value: unknown) => {
      fields.push(`${col} = $${n++}`);
      values.push(value);
    };

    if (data.credit_note_date !== undefined) set('credit_note_date', formatDate(data.credit_note_date));
    if (data.financial_year !== undefined) set('financial_year', data.financial_year);
    if (data.credit_note_type !== undefined) set('credit_note_type', data.credit_note_type);
    if (data.reason !== undefined) set('reason', data.reason);
    if (data.coupon_status !== undefined) set('coupon_status', data.coupon_status);
    if (data.material_condition !== undefined) set('material_condition', data.material_condition);
    if (data.receiving_godown_id !== undefined) set('receiving_godown_id', data.receiving_godown_id);
    if (data.taxable_amount !== undefined) set('taxable_amount', data.taxable_amount);
    if (data.cgst_amount !== undefined) set('cgst_amount', data.cgst_amount);
    if (data.sgst_amount !== undefined) set('sgst_amount', data.sgst_amount);
    if (data.igst_amount !== undefined) set('igst_amount', data.igst_amount);
    if (data.total_credit_amount !== undefined) set('total_credit_amount', data.total_credit_amount);
    if (data.edit_reason !== undefined) set('edit_reason', data.edit_reason);
    if (data.updated_by !== undefined) set('updated_by', data.updated_by ?? null);

    if (fields.length === 0) return this.findById(id, client);

    values.push(id);
    const query = `
      UPDATE credit_notes SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${n}
      RETURNING id
    `;
    if (client) await client.query(query, values);
    else await db.query(query, values);
    return this.findById(id, client);
  }

  async updateNumber(
    id: string,
    creditNoteNumber: string,
    client?: PoolClient
  ): Promise<void> {
    const query = `UPDATE credit_notes SET credit_note_number = $1 WHERE id = $2`;
    if (client) await client.query(query, [creditNoteNumber, id]);
    else await db.query(query, [creditNoteNumber, id]);
  }

  async markPosted(id: string, updatedBy?: string, client?: PoolClient): Promise<void> {
    const query = `
      UPDATE credit_notes
      SET status = 'posted', posted_at = CURRENT_TIMESTAMP, posted_by = $1,
          updated_at = CURRENT_TIMESTAMP, updated_by = $1
      WHERE id = $2
    `;
    const params = [updatedBy ?? null, id];
    if (client) await client.query(query, params);
    else await db.query(query, params);
  }

  async deleteById(id: string, client?: PoolClient): Promise<boolean> {
    const result = client
      ? await client.query('DELETE FROM credit_notes WHERE id = $1', [id])
      : await db.query('DELETE FROM credit_notes WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async markCancelled(
    id: string,
    reason: string,
    updatedBy?: string,
    client?: PoolClient
  ): Promise<void> {
    const query = `
      UPDATE credit_notes
      SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, cancelled_by = $1,
          cancel_reason = $2, updated_at = CURRENT_TIMESTAMP, updated_by = $1
      WHERE id = $3
    `;
    const params = [updatedBy ?? null, reason, id];
    if (client) await client.query(query, params);
    else await db.query(query, params);
  }

  async updateStatus(
    id: string,
    status: CreditNoteStatus,
    updatedBy?: string
  ): Promise<CreditNote | null> {
    if (status === 'posted') {
      await this.markPosted(id, updatedBy);
    } else if (status === 'cancelled') {
      await this.markCancelled(id, '', updatedBy);
    }
    return this.findById(id);
  }

  async sumPostedCreditsByDispatch(
    invoiceDispatchId: string,
    excludeCreditNoteId?: string
  ): Promise<number> {
    const params: unknown[] = [invoiceDispatchId];
    let exclude = '';
    if (excludeCreditNoteId) {
      params.push(excludeCreditNoteId);
      exclude = ` AND id <> $2`;
    }
    const result = await db.query<{ total: string }>(
      `SELECT COALESCE(SUM(total_credit_amount), 0)::text AS total
       FROM credit_notes
       WHERE invoice_dispatch_id = $1 AND status IN ('draft', 'posted') ${exclude}`,
      params
    );
    return parseFloat(result.rows[0]?.total ?? '0') || 0;
  }
}

export const creditNoteDAO = new CreditNoteDAO();
