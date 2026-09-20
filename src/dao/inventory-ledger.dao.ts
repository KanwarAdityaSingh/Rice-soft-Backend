import { db } from '../database/connection';
import { PoolClient } from 'pg';
import {
  InventoryLedgerEntry,
  CreateInventoryLedgerDTO,
  InventoryLedgerSourceType,
} from '../models/inventory-ledger.model';

export class InventoryLedgerDAO {
  async create(data: CreateInventoryLedgerDTO, client?: PoolClient): Promise<InventoryLedgerEntry> {
    const query = `
      INSERT INTO inventory_ledger (godown_id, product_id, quantity_change, source_type, source_id, stock_before, stock_after,
        reference_type, reference_id, batch_id, packaging_id, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, godown_id, product_id, quantity_change, source_type, source_id, stock_before, stock_after,
                reference_type, reference_id, batch_id, packaging_id, created_at, created_by
    `;
    const values = [
      data.godown_id,
      data.product_id,
      data.quantity_change,
      data.source_type,
      data.source_id ?? null,
      data.stock_before,
      data.stock_after,
      data.reference_type ?? null,
      data.reference_id ?? null,
      data.batch_id ?? null,
      data.packaging_id ?? null,
      data.created_by ?? null,
    ];
    const result = client
      ? await client.query(query, values)
      : await db.query(query, values);
    return result.rows[0];
  }

  async find(
    filters: {
      product_id?: string;
      godown_id?: string;
      source_type?: InventoryLedgerSourceType;
      from_date?: string;
      to_date?: string;
      limit: number;
      offset: number;
    }
  ): Promise<{ rows: InventoryLedgerEntry[]; total: number }> {
    let where = ` WHERE 1=1`;
    const params: any[] = [];
    let n = 1;
    if (filters.godown_id) {
      where += ` AND godown_id = $${n++}`;
      params.push(filters.godown_id);
    }
    if (filters.product_id) {
      where += ` AND product_id = $${n++}`;
      params.push(filters.product_id);
    }
    if (filters.source_type) {
      where += ` AND source_type = $${n++}`;
      params.push(filters.source_type);
    }
    if (filters.from_date) {
      where += ` AND created_at >= $${n++}::timestamptz`;
      params.push(filters.from_date);
    }
    if (filters.to_date) {
      where += ` AND created_at <= $${n++}::timestamptz`;
      params.push(filters.to_date);
    }

    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM inventory_ledger${where}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const result = await db.query<InventoryLedgerEntry>(
      `SELECT id, godown_id, product_id, quantity_change, source_type, source_id, stock_before, stock_after,
              reference_type, reference_id, batch_id, packaging_id, created_at, created_by
       FROM inventory_ledger
       ${where}
       ORDER BY created_at DESC
       LIMIT $${n++} OFFSET $${n}`,
      [...params, filters.limit, filters.offset]
    );
    return { rows: result.rows, total };
  }
}

export const inventoryLedgerDAO = new InventoryLedgerDAO();
