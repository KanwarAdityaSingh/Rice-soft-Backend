import { db } from '../database/connection';
import { logger } from '../utils/logger';

export interface SalesmanAssignedArea {
  id: string;
  salesman_id: string;
  state: string | null;
  district: string | null;
  city: string | null;
  territory: string | null;
  created_at: Date;
}

export interface SalesmanAssignedAreaInput {
  state?: string | null;
  district?: string | null;
  city?: string | null;
  territory?: string | null;
}

function normalizeText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

export class SalesmanAssignedAreaDAO {
  async findBySalesmanId(salesmanId: string): Promise<SalesmanAssignedArea[]> {
    const result = await db.query<SalesmanAssignedArea>(
      `SELECT id, salesman_id, state, district, city, territory, created_at
       FROM salesman_assigned_areas
       WHERE salesman_id = $1
       ORDER BY created_at ASC, id ASC`,
      [salesmanId]
    );
    return result.rows;
  }

  /** Delete all areas and insert the provided set (replace-set). */
  async replaceForSalesman(
    salesmanId: string,
    areas: SalesmanAssignedAreaInput[]
  ): Promise<SalesmanAssignedArea[]> {
    await db.query(`DELETE FROM salesman_assigned_areas WHERE salesman_id = $1`, [salesmanId]);

    const seen = new Set<string>();
    for (const area of areas) {
      const state = normalizeText(area.state);
      const district = normalizeText(area.district);
      const city = normalizeText(area.city);
      const territory = normalizeText(area.territory);
      if (!state && !district && !city && !territory) {
        continue;
      }
      const key = [state, district, city, territory]
        .map((v) => (v ?? '').toLowerCase())
        .join('|');
      if (seen.has(key)) continue;
      seen.add(key);

      await db.query(
        `INSERT INTO salesman_assigned_areas (salesman_id, state, district, city, territory)
         VALUES ($1, $2, $3, $4, $5)`,
        [salesmanId, state, district, city, territory]
      );
    }

    logger.info('Salesman assigned areas replaced', {
      salesmanId,
      count: seen.size,
    });

    return this.findBySalesmanId(salesmanId);
  }
}

export const salesmanAssignedAreaDAO = new SalesmanAssignedAreaDAO();
