import { db } from '../database/connection';
import { PurchaseSauda } from '../models/purchase-junction.model';
import { logger } from '../utils/logger';

export class PurchaseSaudaDAO {
  /**
   * Link multiple saudas to a purchase
   */
  async linkSaudas(purchaseId: string, saudaIds: string[]): Promise<void> {
    if (saudaIds.length === 0) return;
    
    const values: string[] = [];
    const placeholders: string[] = [];
    let paramCount = 1;
    
    for (const saudaId of saudaIds) {
      placeholders.push(`($${paramCount++}, $${paramCount++})`);
      values.push(purchaseId, saudaId);
    }
    
    const query = `
      INSERT INTO purchase_saudas (purchase_id, sauda_id)
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (purchase_id, sauda_id) DO NOTHING
    `;
    
    await db.query(query, values);
    logger.info('Saudas linked to purchase', { purchaseId, saudaIds });
  }

  /**
   * Unlink a sauda from a purchase
   */
  async unlinkSauda(purchaseId: string, saudaId: string): Promise<boolean> {
    const query = `DELETE FROM purchase_saudas WHERE purchase_id = $1 AND sauda_id = $2`;
    const result = await db.query(query, [purchaseId, saudaId]);
    const deleted = (result.rowCount || 0) > 0;
    if (deleted) {
      logger.info('Sauda unlinked from purchase', { purchaseId, saudaId });
    }
    return deleted;
  }

  /**
   * Get all sauda IDs linked to a purchase
   */
  async getLinkedSaudaIds(purchaseId: string): Promise<string[]> {
    const query = `SELECT sauda_id FROM purchase_saudas WHERE purchase_id = $1`;
    const result = await db.query<{ sauda_id: string }>(query, [purchaseId]);
    return result.rows.map(row => row.sauda_id);
  }

  /**
   * Get all purchase IDs linked to a sauda
   */
  async getLinkedPurchaseIds(saudaId: string): Promise<string[]> {
    const query = `SELECT purchase_id FROM purchase_saudas WHERE sauda_id = $1`;
    const result = await db.query<{ purchase_id: string }>(query, [saudaId]);
    return result.rows.map(row => row.purchase_id);
  }

  /**
   * Check if a sauda is linked to a purchase
   */
  async isLinked(purchaseId: string, saudaId: string): Promise<boolean> {
    const query = `
      SELECT 1 FROM purchase_saudas 
      WHERE purchase_id = $1 AND sauda_id = $2 
      LIMIT 1
    `;
    const result = await db.query(query, [purchaseId, saudaId]);
    return result.rows.length > 0;
  }

  /**
   * Get all junction records for a purchase
   */
  async findByPurchaseId(purchaseId: string): Promise<PurchaseSauda[]> {
    const query = `
      SELECT id, purchase_id, sauda_id, created_at
      FROM purchase_saudas
      WHERE purchase_id = $1
      ORDER BY created_at ASC
    `;
    const result = await db.query<PurchaseSauda>(query, [purchaseId]);
    return result.rows;
  }

  /**
   * Delete all links for a purchase (used when deleting purchase)
   */
  async deleteByPurchaseId(purchaseId: string): Promise<number> {
    const query = `DELETE FROM purchase_saudas WHERE purchase_id = $1`;
    const result = await db.query(query, [purchaseId]);
    return result.rowCount || 0;
  }
}

export const purchaseSaudaDAO = new PurchaseSaudaDAO();

