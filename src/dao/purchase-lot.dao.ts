import { db } from '../database/connection';
import { PurchaseLot } from '../models/purchase-junction.model';
import { logger } from '../utils/logger';

export class PurchaseLotDAO {
  /**
   * Link multiple lots to a purchase
   */
  async linkLots(purchaseId: string, lotIds: string[]): Promise<void> {
    if (lotIds.length === 0) return;
    
    const values: string[] = [];
    const placeholders: string[] = [];
    let paramCount = 1;
    
    for (const lotId of lotIds) {
      placeholders.push(`($${paramCount++}, $${paramCount++})`);
      values.push(purchaseId, lotId);
    }
    
    const query = `
      INSERT INTO purchase_lots (purchase_id, lot_id)
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (purchase_id, lot_id) DO NOTHING
    `;
    
    await db.query(query, values);
    logger.info('Lots linked to purchase', { purchaseId, lotIds });
  }

  /**
   * Unlink a lot from a purchase
   */
  async unlinkLot(purchaseId: string, lotId: string): Promise<boolean> {
    const query = `DELETE FROM purchase_lots WHERE purchase_id = $1 AND lot_id = $2`;
    const result = await db.query(query, [purchaseId, lotId]);
    const deleted = (result.rowCount || 0) > 0;
    if (deleted) {
      logger.info('Lot unlinked from purchase', { purchaseId, lotId });
    }
    return deleted;
  }

  /**
   * Get all lot IDs linked to a purchase
   */
  async getLinkedLotIds(purchaseId: string): Promise<string[]> {
    const query = `SELECT lot_id FROM purchase_lots WHERE purchase_id = $1`;
    const result = await db.query<{ lot_id: string }>(query, [purchaseId]);
    return result.rows.map(row => row.lot_id);
  }

  /**
   * Get all purchase IDs linked to a lot
   */
  async getLinkedPurchaseIds(lotId: string): Promise<string[]> {
    const query = `SELECT purchase_id FROM purchase_lots WHERE lot_id = $1`;
    const result = await db.query<{ purchase_id: string }>(query, [lotId]);
    return result.rows.map(row => row.purchase_id);
  }

  /**
   * Check if a lot is linked to a purchase
   */
  async isLinked(purchaseId: string, lotId: string): Promise<boolean> {
    const query = `
      SELECT 1 FROM purchase_lots 
      WHERE purchase_id = $1 AND lot_id = $2 
      LIMIT 1
    `;
    const result = await db.query(query, [purchaseId, lotId]);
    return result.rows.length > 0;
  }

  /**
   * Get all junction records for a purchase
   */
  async findByPurchaseId(purchaseId: string): Promise<PurchaseLot[]> {
    const query = `
      SELECT id, purchase_id, lot_id, created_at
      FROM purchase_lots
      WHERE purchase_id = $1
      ORDER BY created_at ASC
    `;
    const result = await db.query<PurchaseLot>(query, [purchaseId]);
    return result.rows;
  }

  /**
   * Delete all links for a purchase (used when deleting purchase)
   */
  async deleteByPurchaseId(purchaseId: string): Promise<number> {
    const query = `DELETE FROM purchase_lots WHERE purchase_id = $1`;
    const result = await db.query(query, [purchaseId]);
    return result.rowCount || 0;
  }
}

export const purchaseLotDAO = new PurchaseLotDAO();

