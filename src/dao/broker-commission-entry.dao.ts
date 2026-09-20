import { PoolClient } from 'pg';
import { db } from '../database/connection';
import {
  BrokerCommissionEntry,
  CreateBrokerCommissionEntryDTO,
} from '../models/broker-commission-entry.model';
import { logger } from '../utils/logger';

const SELECT = `
  e.id, e.broker_id, e.sales_sauda_id, e.invoice_dispatch_id, e.credit_note_id,
  e.entry_type, e.commission_type, e.commission_rate,
  e.basis_quantity, e.basis_sale_amount, e.commission_amount, e.status,
  e.approved_at, e.approved_by, e.paid_at, e.paid_by, e.notes,
  e.created_at, e.created_by, e.updated_at,
  b.business_name AS broker_name,
  ss.order_number,
  idisp.internal_invoice_number AS invoice_number,
  cn.credit_note_number,
  COALESCE(idisp.party_name, sp.business_name) AS party_name
`;

const FROM = `
  FROM broker_commission_entries e
  LEFT JOIN brokers b ON b.id = e.broker_id
  LEFT JOIN sales_saudas ss ON ss.id = e.sales_sauda_id
  LEFT JOIN sales_parties sp ON sp.id = ss.sales_party_id
  LEFT JOIN invoice_dispatches idisp ON idisp.id = e.invoice_dispatch_id
  LEFT JOIN credit_notes cn ON cn.id = e.credit_note_id
`;

function transform(row: BrokerCommissionEntry): BrokerCommissionEntry {
  return {
    ...row,
    commission_rate: Number(row.commission_rate),
    basis_quantity: Number(row.basis_quantity),
    basis_sale_amount: Number(row.basis_sale_amount),
    commission_amount: Number(row.commission_amount),
  };
}

export class BrokerCommissionEntryDAO {
  async create(
    data: CreateBrokerCommissionEntryDTO,
    client?: PoolClient
  ): Promise<BrokerCommissionEntry> {
    const sql = `
      INSERT INTO broker_commission_entries (
        broker_id, sales_sauda_id, invoice_dispatch_id, credit_note_id,
        entry_type, commission_type, commission_rate,
        basis_quantity, basis_sale_amount, commission_amount,
        status, notes, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id
    `;
    const values = [
      data.broker_id,
      data.sales_sauda_id,
      data.invoice_dispatch_id ?? null,
      data.credit_note_id ?? null,
      data.entry_type,
      data.commission_type,
      data.commission_rate,
      data.basis_quantity,
      data.basis_sale_amount,
      data.commission_amount,
      data.status ?? 'pending',
      data.notes ?? null,
      data.created_by ?? null,
    ];
    const inserted = client
      ? await client.query<{ id: string }>(sql, values)
      : await db.query<{ id: string }>(sql, values);
    const created = await this.findById(inserted.rows[0].id, client);
    if (!created) throw new Error('Failed to load broker commission entry after create');
    logger.info('Broker commission entry created', {
      id: created.id,
      entry_type: created.entry_type,
      amount: created.commission_amount,
    });
    return created;
  }

  async findById(
    id: string,
    client?: PoolClient
  ): Promise<BrokerCommissionEntry | null> {
    const sql = `SELECT ${SELECT} ${FROM} WHERE e.id = $1`;
    const result = client
      ? await client.query<BrokerCommissionEntry>(sql, [id])
      : await db.query<BrokerCommissionEntry>(sql, [id]);
    return result.rows[0] ? transform(result.rows[0]) : null;
  }

  async findAccrualByDispatchAndSauda(
    invoiceDispatchId: string,
    salesSaudaId: string,
    client?: PoolClient
  ): Promise<BrokerCommissionEntry | null> {
    const sql = `SELECT ${SELECT} ${FROM}
       WHERE e.invoice_dispatch_id = $1
         AND e.sales_sauda_id = $2
         AND e.entry_type = 'accrual'
       LIMIT 1`;
    const params = [invoiceDispatchId, salesSaudaId];
    const result = client
      ? await client.query<BrokerCommissionEntry>(sql, params)
      : await db.query<BrokerCommissionEntry>(sql, params);
    return result.rows[0] ? transform(result.rows[0]) : null;
  }

  async findReversalByCreditNoteId(
    creditNoteId: string,
    client?: PoolClient
  ): Promise<BrokerCommissionEntry | null> {
    const sql = `SELECT ${SELECT} ${FROM}
       WHERE e.credit_note_id = $1 AND e.entry_type = 'reversal'
       LIMIT 1`;
    const result = client
      ? await client.query<BrokerCommissionEntry>(sql, [creditNoteId])
      : await db.query<BrokerCommissionEntry>(sql, [creditNoteId]);
    return result.rows[0] ? transform(result.rows[0]) : null;
  }

  async hasAccrualForSauda(
    salesSaudaId: string,
    client?: PoolClient
  ): Promise<boolean> {
    const sql = `SELECT 1 FROM broker_commission_entries
       WHERE sales_sauda_id = $1 AND entry_type = 'accrual'
       LIMIT 1`;
    const result = client
      ? await client.query(sql, [salesSaudaId])
      : await db.query(sql, [salesSaudaId]);
    return result.rows.length > 0;
  }

  async countBySalesSaudaId(salesSaudaId: string): Promise<number> {
    const result = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM broker_commission_entries WHERE sales_sauda_id = $1`,
      [salesSaudaId]
    );
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }

  async listByBrokerId(
    brokerId: string,
    options?: { fromDate?: string; toDate?: string }
  ): Promise<BrokerCommissionEntry[]> {
    const conditions = ['e.broker_id = $1'];
    const params: unknown[] = [brokerId];
    let n = 2;
    if (options?.fromDate) {
      conditions.push(`e.created_at::date >= $${n++}::date`);
      params.push(options.fromDate);
    }
    if (options?.toDate) {
      conditions.push(`e.created_at::date <= $${n++}::date`);
      params.push(options.toDate);
    }
    const result = await db.query<BrokerCommissionEntry>(
      `SELECT ${SELECT} ${FROM}
       WHERE ${conditions.join(' AND ')}
       ORDER BY e.created_at DESC, e.id DESC`,
      params
    );
    return result.rows.map(transform);
  }

  async deletePendingReversalByCreditNoteId(
    creditNoteId: string,
    client?: PoolClient
  ): Promise<void> {
    const sql = `DELETE FROM broker_commission_entries
       WHERE credit_note_id = $1 AND entry_type = 'reversal' AND status = 'pending'`;
    if (client) await client.query(sql, [creditNoteId]);
    else await db.query(sql, [creditNoteId]);
  }

  async deleteAllByCreditNoteId(creditNoteId: string, client?: PoolClient): Promise<void> {
    const sql = `DELETE FROM broker_commission_entries WHERE credit_note_id = $1`;
    if (client) await client.query(sql, [creditNoteId]);
    else await db.query(sql, [creditNoteId]);
  }
}

export const brokerCommissionEntryDAO = new BrokerCommissionEntryDAO();
