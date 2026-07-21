import { db } from '../database/connection';
import {
  SalesmanSalaryHistory,
  UpsertSalesmanSalaryDTO,
} from '../models/salesman.model';
import { logger } from '../utils/logger';

export class SalesmanSalaryHistoryDAO {
  async findBySalesmanId(salesmanId: string): Promise<SalesmanSalaryHistory[]> {
    const result = await db.query<SalesmanSalaryHistory>(
      `SELECT id, salesman_id, salary_type, basic_salary, effective_from, created_at, created_by
       FROM salesman_salary_history
       WHERE salesman_id = $1
       ORDER BY effective_from DESC, created_at DESC`,
      [salesmanId]
    );
    return result.rows.map((row) => ({
      ...row,
      basic_salary: Number(row.basic_salary),
    }));
  }

  /**
   * Upsert history for (salesman_id, effective_from).
   * Returns the history row and whether this effective_from should become the current master salary
   * (i.e. it is >= any existing history / current date for this salesman).
   */
  async upsert(
    salesmanId: string,
    data: UpsertSalesmanSalaryDTO
  ): Promise<{ history: SalesmanSalaryHistory; isLatest: boolean }> {
    const result = await db.query<SalesmanSalaryHistory>(
      `INSERT INTO salesman_salary_history (
         salesman_id, salary_type, basic_salary, effective_from, created_by
       )
       VALUES ($1, $2, $3, $4::date, $5)
       ON CONFLICT (salesman_id, effective_from)
       DO UPDATE SET
         salary_type = EXCLUDED.salary_type,
         basic_salary = EXCLUDED.basic_salary,
         created_by = COALESCE(EXCLUDED.created_by, salesman_salary_history.created_by)
       RETURNING id, salesman_id, salary_type, basic_salary, effective_from, created_at, created_by`,
      [
        salesmanId,
        data.salary_type,
        data.basic_salary,
        data.effective_from,
        data.created_by || null,
      ]
    );

    const history = {
      ...result.rows[0],
      basic_salary: Number(result.rows[0].basic_salary),
    };

    const latest = await db.query<{ effective_from: Date }>(
      `SELECT effective_from
       FROM salesman_salary_history
       WHERE salesman_id = $1
       ORDER BY effective_from DESC
       LIMIT 1`,
      [salesmanId]
    );

    const toYmd = (value: Date | string): string => {
      if (typeof value === 'string') return value.slice(0, 10);
      const y = value.getUTCFullYear();
      const m = String(value.getUTCMonth() + 1).padStart(2, '0');
      const d = String(value.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    const latestDate = latest.rows[0]?.effective_from;
    const isLatest =
      latestDate != null && toYmd(latestDate) === toYmd(data.effective_from);

    logger.info('Salesman salary history upserted', {
      salesmanId,
      effectiveFrom: data.effective_from,
      isLatest,
    });

    return { history, isLatest };
  }
}

export const salesmanSalaryHistoryDAO = new SalesmanSalaryHistoryDAO();
