import { PoolClient } from 'pg';
import { db } from '../database/connection';
import { PackagingWeight } from '../models/packaging.model';

export interface ProductRateHistoryListFilters {
  holding_capacity?: PackagingWeight;
  /** Inclusive YYYY-MM-DD */
  from?: string;
  /** Inclusive YYYY-MM-DD */
  to?: string;
  limit: number;
  offset: number;
}

/** Row from list query (join users for display name) */
export interface ProductRateHistoryJoinedRow {
  id: string;
  product_id: string;
  holding_capacity: number;
  rate: string;
  effective_date: Date | string;
  created_at: Date;
  created_by: string | null;
  created_by_full_name: string | null;
}

function toDateString(value: Date | string): string {
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

export class ProductRateHistoryDAO {
  /**
   * Upsert one history point for (product, capacity, effective_date).
   */
  async upsert(
    client: PoolClient,
    params: {
      product_id: string;
      holding_capacity: number;
      rate: number;
      effective_date: string;
      created_by: string | null;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO product_rate_history (product_id, holding_capacity, rate, effective_date, created_by)
       VALUES ($1, $2, $3, $4::date, $5)
       ON CONFLICT (product_id, holding_capacity, effective_date)
       DO UPDATE SET
         rate = EXCLUDED.rate,
         created_by = EXCLUDED.created_by,
         created_at = CURRENT_TIMESTAMP`,
      [
        params.product_id,
        params.holding_capacity,
        params.rate,
        params.effective_date,
        params.created_by,
      ]
    );
  }

  /**
   * History for one product, oldest effective_date first (chart-friendly).
   */
  async findByProductId(
    productId: string,
    filters: ProductRateHistoryListFilters
  ): Promise<ProductRateHistoryJoinedRow[]> {
    const conditions: string[] = ['h.product_id = $1'];
    const values: unknown[] = [productId];
    let n = 2;

    if (filters.holding_capacity !== undefined) {
      conditions.push(`h.holding_capacity = $${n++}`);
      values.push(filters.holding_capacity);
    }
    if (filters.from !== undefined) {
      conditions.push(`h.effective_date >= $${n++}::date`);
      values.push(filters.from);
    }
    if (filters.to !== undefined) {
      conditions.push(`h.effective_date <= $${n++}::date`);
      values.push(filters.to);
    }

    const limitIdx = n++;
    const offsetIdx = n++;
    values.push(filters.limit, filters.offset);

    const query = `
      SELECT
        h.id,
        h.product_id,
        h.holding_capacity,
        h.rate,
        to_char(h.effective_date, 'YYYY-MM-DD') AS effective_date,
        h.created_at,
        h.created_by,
        u.full_name AS created_by_full_name
      FROM product_rate_history h
      LEFT JOIN users u ON u.id = h.created_by
      WHERE ${conditions.join(' AND ')}
      ORDER BY h.effective_date ASC, h.holding_capacity ASC, h.created_at ASC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const result = await db.query<ProductRateHistoryJoinedRow>(query, values);
    return result.rows;
  }

  /** Format DB date as YYYY-MM-DD for API responses */
  formatEffectiveDate(value: Date | string): string {
    return toDateString(value);
  }
}

export const productRateHistoryDAO = new ProductRateHistoryDAO();
