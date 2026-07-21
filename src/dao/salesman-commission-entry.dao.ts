import { PoolClient } from 'pg';
import { db } from '../database/connection';
import {
  CreateSalesmanCommissionEntryDTO,
  SalesmanCommissionEntry,
  SalesmanCommissionEntryStatus,
} from '../models/salesman-commission-entry.model';
import type { SalesmanCommissionConfig } from '../constants/salesman-commission-types';
import { logger } from '../utils/logger';

const SELECT = `
  e.id, e.salesman_id, e.sales_sauda_id, e.invoice_dispatch_id, e.credit_note_id,
  e.entry_type, e.commission_type, e.commission_config,
  e.basis_quantity, e.basis_sale_amount, e.commission_amount, e.status,
  e.approved_at, e.approved_by, e.paid_at, e.paid_by, e.notes,
  e.created_at, e.created_by, e.updated_at,
  sm.name AS salesman_name,
  ss.order_number,
  idisp.internal_invoice_number AS invoice_number,
  cn.credit_note_number,
  COALESCE(idisp.party_name, sp.business_name) AS party_name
`;

const FROM = `
  FROM salesman_commission_entries e
  LEFT JOIN salesmen sm ON sm.id = e.salesman_id
  LEFT JOIN sales_saudas ss ON ss.id = e.sales_sauda_id
  LEFT JOIN sales_parties sp ON sp.id = ss.sales_party_id
  LEFT JOIN invoice_dispatches idisp ON idisp.id = e.invoice_dispatch_id
  LEFT JOIN credit_notes cn ON cn.id = e.credit_note_id
`;

function transform(row: SalesmanCommissionEntry): SalesmanCommissionEntry {
  return {
    ...row,
    commission_config: (row.commission_config || {}) as SalesmanCommissionConfig,
    basis_quantity: Number(row.basis_quantity),
    basis_sale_amount: Number(row.basis_sale_amount),
    commission_amount: Number(row.commission_amount),
  };
}

export class SalesmanCommissionEntryDAO {
  async findById(id: string): Promise<SalesmanCommissionEntry | null> {
    const result = await db.query<SalesmanCommissionEntry>(
      `SELECT ${SELECT} ${FROM} WHERE e.id = $1`,
      [id]
    );
    return result.rows[0] ? transform(result.rows[0]) : null;
  }

  async findAccrualByDispatchId(
    invoiceDispatchId: string,
    client?: PoolClient
  ): Promise<SalesmanCommissionEntry | null> {
    const sql = `SELECT ${SELECT} ${FROM}
       WHERE e.invoice_dispatch_id = $1 AND e.entry_type = 'accrual'
       LIMIT 1`;
    const params = [invoiceDispatchId];
    const result = client
      ? await client.query<SalesmanCommissionEntry>(sql, params)
      : await db.query<SalesmanCommissionEntry>(sql, params);
    return result.rows[0] ? transform(result.rows[0]) : null;
  }

  async findReversalByCreditNoteId(
    creditNoteId: string,
    client?: PoolClient
  ): Promise<SalesmanCommissionEntry | null> {
    const sql = `SELECT ${SELECT} ${FROM}
       WHERE e.credit_note_id = $1 AND e.entry_type = 'reversal'
       LIMIT 1`;
    const params = [creditNoteId];
    const result = client
      ? await client.query<SalesmanCommissionEntry>(sql, params)
      : await db.query<SalesmanCommissionEntry>(sql, params);
    return result.rows[0] ? transform(result.rows[0]) : null;
  }

  async hasAccrualForSauda(
    salesSaudaId: string,
    client?: PoolClient
  ): Promise<boolean> {
    const sql = `SELECT 1 FROM salesman_commission_entries
       WHERE sales_sauda_id = $1 AND entry_type = 'accrual'
       LIMIT 1`;
    const params = [salesSaudaId];
    const result = client ? await client.query(sql, params) : await db.query(sql, params);
    return result.rows.length > 0;
  }

  async create(
    data: CreateSalesmanCommissionEntryDTO,
    client?: PoolClient
  ): Promise<SalesmanCommissionEntry> {
    const sql = `INSERT INTO salesman_commission_entries (
         salesman_id, sales_sauda_id, invoice_dispatch_id, credit_note_id,
         entry_type, commission_type, commission_config,
         basis_quantity, basis_sale_amount, commission_amount,
         status, notes, created_by
       ) VALUES (
         $1, $2, $3, $4,
         $5, $6, $7::jsonb,
         $8, $9, $10,
         $11, $12, $13
       )
       RETURNING id`;
    const values = [
      data.salesman_id,
      data.sales_sauda_id,
      data.invoice_dispatch_id ?? null,
      data.credit_note_id ?? null,
      data.entry_type,
      data.commission_type,
      JSON.stringify(data.commission_config),
      data.basis_quantity,
      data.basis_sale_amount,
      data.commission_amount,
      data.status ?? 'pending',
      data.notes ?? null,
      data.created_by ?? null,
    ];
    const result = client
      ? await client.query<{ id: string }>(sql, values)
      : await db.query<{ id: string }>(sql, values);
    const id = result.rows[0].id;
    logger.info('Salesman commission entry created', {
      id,
      entryType: data.entry_type,
      amount: data.commission_amount,
    });
    if (client) {
      const row = await client.query<SalesmanCommissionEntry>(
        `SELECT ${SELECT} ${FROM} WHERE e.id = $1`,
        [id]
      );
      return transform(row.rows[0]);
    }
    return (await this.findById(id))!;
  }

  async list(filters: {
    salesmanId?: string;
    status?: SalesmanCommissionEntryStatus;
    from?: string;
    to?: string;
  }): Promise<SalesmanCommissionEntry[]> {
    const params: unknown[] = [];
    let where = 'WHERE 1=1';
    let i = 1;
    if (filters.salesmanId) {
      where += ` AND e.salesman_id = $${i++}`;
      params.push(filters.salesmanId);
    }
    if (filters.status) {
      where += ` AND e.status = $${i++}`;
      params.push(filters.status);
    }
    if (filters.from) {
      where += ` AND e.created_at::date >= $${i++}::date`;
      params.push(filters.from);
    }
    if (filters.to) {
      where += ` AND e.created_at::date <= $${i++}::date`;
      params.push(filters.to);
    }
    const result = await db.query<SalesmanCommissionEntry>(
      `SELECT ${SELECT} ${FROM} ${where}
       ORDER BY e.created_at DESC, e.id DESC`,
      params
    );
    return result.rows.map(transform);
  }

  async setStatus(
    id: string,
    status: SalesmanCommissionEntryStatus,
    userId?: string
  ): Promise<SalesmanCommissionEntry | null> {
    let query: string;
    let params: unknown[];
    if (status === 'approved') {
      query = `
        UPDATE salesman_commission_entries
        SET status = 'approved',
            approved_at = CURRENT_TIMESTAMP,
            approved_by = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status = 'pending'
        RETURNING id`;
      params = [id, userId ?? null];
    } else if (status === 'paid') {
      query = `
        UPDATE salesman_commission_entries
        SET status = 'paid',
            paid_at = CURRENT_TIMESTAMP,
            paid_by = $2,
            approved_at = COALESCE(approved_at, CURRENT_TIMESTAMP),
            approved_by = COALESCE(approved_by, $2),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status IN ('pending', 'approved')
        RETURNING id`;
      params = [id, userId ?? null];
    } else {
      return this.findById(id);
    }
    const result = await db.query<{ id: string }>(query, params);
    if (!result.rows[0]) return null;
    return this.findById(id);
  }

  async monthlyTotals(filters: {
    salesmanId?: string;
    from?: string;
    to?: string;
  }): Promise<
    Array<{
      month: string;
      salesman_id: string;
      salesman_name: string | null;
      total_commission: number;
      pending: number;
      approved: number;
      paid: number;
    }>
  > {
    const params: unknown[] = [];
    let where = 'WHERE 1=1';
    let i = 1;
    if (filters.salesmanId) {
      where += ` AND e.salesman_id = $${i++}`;
      params.push(filters.salesmanId);
    }
    if (filters.from) {
      where += ` AND e.created_at::date >= $${i++}::date`;
      params.push(filters.from);
    }
    if (filters.to) {
      where += ` AND e.created_at::date <= $${i++}::date`;
      params.push(filters.to);
    }
    const result = await db.query<{
      month: string;
      salesman_id: string;
      salesman_name: string | null;
      total_commission: string;
      pending: string;
      approved: string;
      paid: string;
    }>(
      `SELECT
         TO_CHAR(DATE_TRUNC('month', e.created_at), 'YYYY-MM') AS month,
         e.salesman_id,
         sm.name AS salesman_name,
         COALESCE(SUM(e.commission_amount), 0) AS total_commission,
         COALESCE(SUM(CASE WHEN e.status = 'pending' THEN e.commission_amount ELSE 0 END), 0) AS pending,
         COALESCE(SUM(CASE WHEN e.status = 'approved' THEN e.commission_amount ELSE 0 END), 0) AS approved,
         COALESCE(SUM(CASE WHEN e.status = 'paid' THEN e.commission_amount ELSE 0 END), 0) AS paid
       FROM salesman_commission_entries e
       LEFT JOIN salesmen sm ON sm.id = e.salesman_id
       ${where}
       GROUP BY 1, e.salesman_id, sm.name
       ORDER BY 1 DESC, sm.name ASC`,
      params
    );
    return result.rows.map((r) => ({
      month: r.month,
      salesman_id: r.salesman_id,
      salesman_name: r.salesman_name,
      total_commission: Number(r.total_commission),
      pending: Number(r.pending),
      approved: Number(r.approved),
      paid: Number(r.paid),
    }));
  }
}

export const salesmanCommissionEntryDAO = new SalesmanCommissionEntryDAO();
