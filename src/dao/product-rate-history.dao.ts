import { PoolClient } from 'pg';
import { db } from '../database/connection';
import { PackagingWeight } from '../models/packaging.model';

export interface ProductRateHistoryListFilters {
  holding_capacity?: PackagingWeight;
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
}

/** Row from list query (join users for display name) */
export interface ProductRateHistoryJoinedRow {
  id: string;
  product_id: string;
  holding_capacity: number;
  rate: string;
  created_at: Date;
  created_by: string | null;
  created_by_full_name: string | null;
}

export class ProductRateHistoryDAO {
  async insert(
    client: PoolClient,
    params: {
      product_id: string;
      holding_capacity: number;
      rate: number;
      created_by: string | null;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO product_rate_history (product_id, holding_capacity, rate, created_by)
       VALUES ($1, $2, $3, $4)`,
      [params.product_id, params.holding_capacity, params.rate, params.created_by]
    );
  }

  /**
   * History for one product, oldest first (chart-friendly). Caller should ensure product exists.
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
      conditions.push(`h.created_at >= $${n++}`);
      values.push(filters.from);
    }
    if (filters.to !== undefined) {
      conditions.push(`h.created_at <= $${n++}`);
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
        h.created_at,
        h.created_by,
        u.full_name AS created_by_full_name
      FROM product_rate_history h
      LEFT JOIN users u ON u.id = h.created_by
      WHERE ${conditions.join(' AND ')}
      ORDER BY h.created_at ASC, h.holding_capacity ASC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const result = await db.query<ProductRateHistoryJoinedRow>(query, values);
    return result.rows;
  }
}

export const productRateHistoryDAO = new ProductRateHistoryDAO();
