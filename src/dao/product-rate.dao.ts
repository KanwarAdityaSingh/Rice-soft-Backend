import { db } from '../database/connection';
import { ProductRate } from '../models/product-rate.model';
import { PackagingWeight } from '../models/packaging.model';
import { logger } from '../utils/logger';
import { productRateHistoryDAO } from './product-rate-history.dao';

const VALID_CAPACITIES: PackagingWeight[] = [5, 10, 25, 26, 30, 50];

function isPackagingWeight(n: number): n is PackagingWeight {
  return VALID_CAPACITIES.includes(n as PackagingWeight);
}

function ratesEqual(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

export class ProductRateDAO {
  /**
   * Returns the suggested sell rate for (product_id, holding_capacity), or null if not set.
   * Coerces holdingCapacity to integer (packaging.holding_capacity can come from DB as "5.00").
   */
  async findByProductAndHoldingCapacity(
    productId: string,
    holdingCapacity: PackagingWeight | number | string
  ): Promise<number | null> {
    const capacityInt = Math.round(Number(holdingCapacity));
    if (!isPackagingWeight(capacityInt)) return null;

    const query = `
      SELECT rate
      FROM product_rates
      WHERE product_id = $1 AND holding_capacity = $2
    `;
    const result = await db.query<{ rate: string }>(query, [productId, capacityInt]);
    const row = result.rows[0];
    if (!row) return null;
    return Number(row.rate);
  }

  async findByProductId(productId: string): Promise<ProductRate[]> {
    const query = `
      SELECT id, product_id, holding_capacity, rate, created_at, updated_at
      FROM product_rates
      WHERE product_id = $1
      ORDER BY holding_capacity ASC
    `;
    const result = await db.query<ProductRate>(query, [productId]);
    return result.rows;
  }

  /**
   * Returns all product_rates for the given product IDs (one query for list endpoint).
   */
  async findByProductIds(productIds: string[]): Promise<ProductRate[]> {
    if (productIds.length === 0) return [];
    const query = `
      SELECT id, product_id, holding_capacity, rate, created_at, updated_at
      FROM product_rates
      WHERE product_id = ANY($1::uuid[])
      ORDER BY product_id, holding_capacity ASC
    `;
    const result = await db.query<ProductRate>(query, [productIds]);
    return result.rows;
  }

  /**
   * Set all rates for a product. Replaces any existing rates for the given capacities.
   * Each item in rates must have holding_capacity in (5, 10, 25, 26, 30, 50).
   * Appends to product_rate_history when the rate value changes (or is set for the first time).
   */
  async upsertRates(
    productId: string,
    rates: Array<{ holding_capacity: number; rate: number }>,
    createdBy?: string | null
  ): Promise<ProductRate[]> {
    return db.transaction(async (client) => {
      const results: ProductRate[] = [];
      const createdById = createdBy ?? null;

      for (const r of rates) {
        if (!isPackagingWeight(r.holding_capacity)) continue;
        if (Number(r.rate) < 0) continue;

        const capacityInt = r.holding_capacity;
        const newRate = Number(r.rate);

        const prevRes = await client.query<{ rate: string }>(
          `SELECT rate FROM product_rates WHERE product_id = $1 AND holding_capacity = $2`,
          [productId, capacityInt]
        );
        const prevRow = prevRes.rows[0];
        const prevRate = prevRow !== undefined ? Number(prevRow.rate) : null;

        const upsertRes = await client.query<ProductRate>(
          `
          INSERT INTO product_rates (product_id, holding_capacity, rate)
          VALUES ($1, $2, $3)
          ON CONFLICT (product_id, holding_capacity) DO UPDATE SET rate = EXCLUDED.rate, updated_at = CURRENT_TIMESTAMP
          RETURNING id, product_id, holding_capacity, rate, created_at, updated_at
        `,
          [productId, capacityInt, newRate]
        );
        const row = upsertRes.rows[0];
        if (row) results.push(row);

        const shouldLog = prevRate === null || !ratesEqual(prevRate, newRate);
        if (shouldLog) {
          await productRateHistoryDAO.insert(client, {
            product_id: productId,
            holding_capacity: capacityInt,
            rate: newRate,
            created_by: createdById,
          });
        }
      }

      logger.info('Product rates upserted', { product_id: productId, count: results.length });
      return results;
    });
  }
}

export const productRateDAO = new ProductRateDAO();
