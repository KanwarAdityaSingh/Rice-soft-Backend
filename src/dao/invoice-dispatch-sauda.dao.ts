import { PoolClient } from 'pg';
import { db } from '../database/connection';
import { logger } from '../utils/logger';

export class InvoiceDispatchSaudaDAO {
  async linkSaudas(
    invoiceDispatchId: string,
    saudaIds: string[],
    client?: PoolClient
  ): Promise<void> {
    if (saudaIds.length === 0) return;

    const values: string[] = [];
    const placeholders: string[] = [];
    let paramCount = 1;

    for (const saudaId of saudaIds) {
      placeholders.push(`($${paramCount++}, $${paramCount++})`);
      values.push(invoiceDispatchId, saudaId);
    }

    const query = `
      INSERT INTO invoice_dispatch_saudas (invoice_dispatch_id, sales_sauda_id)
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (invoice_dispatch_id, sales_sauda_id) DO NOTHING
    `;

    if (client) {
      await client.query(query, values);
    } else {
      await db.query(query, values);
    }
    logger.info('Saudas linked to invoice dispatch', { invoiceDispatchId, saudaIds });
  }

  async getLinkedSaudaIds(
    invoiceDispatchId: string,
    client?: PoolClient
  ): Promise<string[]> {
    const query = `
      SELECT sales_sauda_id
      FROM invoice_dispatch_saudas
      WHERE invoice_dispatch_id = $1
      ORDER BY created_at ASC, sales_sauda_id ASC
    `;
    const result = client
      ? await client.query<{ sales_sauda_id: string }>(query, [invoiceDispatchId])
      : await db.query<{ sales_sauda_id: string }>(query, [invoiceDispatchId]);
    return result.rows.map((row) => row.sales_sauda_id);
  }

  async getLinkedSaudaIdsByDispatchIds(
    invoiceDispatchIds: string[]
  ): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (invoiceDispatchIds.length === 0) return map;

    const result = await db.query<{
      invoice_dispatch_id: string;
      sales_sauda_id: string;
    }>(
      `SELECT invoice_dispatch_id, sales_sauda_id
       FROM invoice_dispatch_saudas
       WHERE invoice_dispatch_id = ANY($1::uuid[])
       ORDER BY created_at ASC, sales_sauda_id ASC`,
      [invoiceDispatchIds]
    );

    for (const row of result.rows) {
      const list = map.get(row.invoice_dispatch_id) ?? [];
      list.push(row.sales_sauda_id);
      map.set(row.invoice_dispatch_id, list);
    }
    return map;
  }
}

export const invoiceDispatchSaudaDAO = new InvoiceDispatchSaudaDAO();
