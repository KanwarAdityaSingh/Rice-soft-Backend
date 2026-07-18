import { db } from '../database/connection';
import { ProductRate } from '../models/product-rate.model';
import { PackagingWeight } from '../models/packaging.model';
import { logger } from '../utils/logger';
import { productRateHistoryDAO } from './product-rate-history.dao';

const VALID_CAPACITIES: PackagingWeight[] = [5, 10, 25, 26, 30, 50];

function isPackagingWeight(n: number): n is PackagingWeight {
  return VALID_CAPACITIES.includes(n as PackagingWeight);
}

function formatEffectiveDate(value: Date | string | null | undefined): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
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
      SELECT id, product_id, holding_capacity, rate,
             to_char(effective_date, 'YYYY-MM-DD') AS effective_date,
             created_at, updated_at
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
      SELECT id, product_id, holding_capacity, rate,
             to_char(effective_date, 'YYYY-MM-DD') AS effective_date,
             created_at, updated_at
      FROM product_rates
      WHERE product_id = ANY($1::uuid[])
      ORDER BY product_id, holding_capacity ASC
    `;
    const result = await db.query<ProductRate>(query, [productIds]);
    return result.rows;
  }

  /**
   * Save rates for a product as of effective_date.
   * - Upserts history for that business date (one row per capacity per day)
   * - Updates current product_rates only when this date is >= the current effective_date
   */
  async upsertRates(
    productId: string,
    rates: Array<{ holding_capacity: number; rate: number }>,
    effectiveDate: string,
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

        await productRateHistoryDAO.upsert(client, {
          product_id: productId,
          holding_capacity: capacityInt,
          rate: newRate,
          effective_date: effectiveDate,
          created_by: createdById,
        });

        const prevRes = await client.query<{ rate: string; effective_date: string }>(
          `SELECT rate, to_char(effective_date, 'YYYY-MM-DD') AS effective_date
           FROM product_rates WHERE product_id = $1 AND holding_capacity = $2`,
          [productId, capacityInt]
        );
        const prev = prevRes.rows[0];
        const prevEffective = prev ? formatEffectiveDate(prev.effective_date) : null;

        // Current rate follows the latest business date
        if (prevEffective === null || effectiveDate >= prevEffective) {
          const upsertRes = await client.query<ProductRate>(
            `
            INSERT INTO product_rates (product_id, holding_capacity, rate, effective_date)
            VALUES ($1, $2, $3, $4::date)
            ON CONFLICT (product_id, holding_capacity) DO UPDATE SET
              rate = EXCLUDED.rate,
              effective_date = EXCLUDED.effective_date,
              updated_at = CURRENT_TIMESTAMP
            RETURNING id, product_id, holding_capacity, rate,
                      to_char(effective_date, 'YYYY-MM-DD') AS effective_date,
                      created_at, updated_at
          `,
            [productId, capacityInt, newRate, effectiveDate]
          );
          const row = upsertRes.rows[0];
          if (row) results.push(row);
        } else {
          // Backdated history only — return current row unchanged
          const currentRes = await client.query<ProductRate>(
            `
            SELECT id, product_id, holding_capacity, rate,
                   to_char(effective_date, 'YYYY-MM-DD') AS effective_date,
                   created_at, updated_at
            FROM product_rates
            WHERE product_id = $1 AND holding_capacity = $2
          `,
            [productId, capacityInt]
          );
          const row = currentRes.rows[0];
          if (row) results.push(row);
        }
      }

      logger.info('Product rates upserted', {
        product_id: productId,
        effective_date: effectiveDate,
        count: results.length,
      });
      return results;
    });
  }
}

export const productRateDAO = new ProductRateDAO();
