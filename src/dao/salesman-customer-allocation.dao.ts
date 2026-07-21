import { db } from '../database/connection';
import { logger } from '../utils/logger';

export interface SalesmanCustomerAllocation {
  id: string;
  salesman_id: string;
  sales_party_id: string;
  created_at: Date;
  /** Joined when selected */
  sales_party_name?: string | null;
}

export class SalesmanCustomerAllocationDAO {
  async findBySalesmanId(salesmanId: string): Promise<SalesmanCustomerAllocation[]> {
    const result = await db.query<SalesmanCustomerAllocation>(
      `SELECT
         a.id, a.salesman_id, a.sales_party_id, a.created_at,
         sp.business_name AS sales_party_name
       FROM salesman_customer_allocations a
       LEFT JOIN sales_parties sp ON sp.id = a.sales_party_id
       WHERE a.salesman_id = $1
       ORDER BY sp.business_name ASC NULLS LAST, a.created_at ASC`,
      [salesmanId]
    );
    return result.rows;
  }

  /** Delete all allocations and insert the provided party ids (replace-set). */
  async replaceForSalesman(
    salesmanId: string,
    salesPartyIds: string[]
  ): Promise<SalesmanCustomerAllocation[]> {
    await db.query(`DELETE FROM salesman_customer_allocations WHERE salesman_id = $1`, [
      salesmanId,
    ]);

    const uniqueIds = [...new Set(salesPartyIds.filter(Boolean))];
    for (const partyId of uniqueIds) {
      await db.query(
        `INSERT INTO salesman_customer_allocations (salesman_id, sales_party_id)
         VALUES ($1, $2)
         ON CONFLICT (salesman_id, sales_party_id) DO NOTHING`,
        [salesmanId, partyId]
      );
    }

    logger.info('Salesman customer allocations replaced', {
      salesmanId,
      count: uniqueIds.length,
    });

    return this.findBySalesmanId(salesmanId);
  }
}

export const salesmanCustomerAllocationDAO = new SalesmanCustomerAllocationDAO();
