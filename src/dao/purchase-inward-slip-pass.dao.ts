import { db } from '../database/connection';
import { PurchaseInwardSlipPass } from '../models/purchase-junction.model';
import { logger } from '../utils/logger';

export class PurchaseInwardSlipPassDAO {
  /**
   * Link multiple inward slip passes to a purchase
   */
  async linkInwardSlipPasses(purchaseId: string, ispIds: string[]): Promise<void> {
    if (ispIds.length === 0) return;
    
    const values: string[] = [];
    const placeholders: string[] = [];
    let paramCount = 1;
    
    for (const ispId of ispIds) {
      placeholders.push(`($${paramCount++}, $${paramCount++})`);
      values.push(purchaseId, ispId);
    }
    
    const query = `
      INSERT INTO purchase_inward_slip_passes (purchase_id, inward_slip_pass_id)
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (purchase_id, inward_slip_pass_id) DO NOTHING
    `;
    
    await db.query(query, values);
    logger.info('Inward slip passes linked to purchase', { purchaseId, ispIds });
  }

  /**
   * Unlink an inward slip pass from a purchase
   */
  async unlinkInwardSlipPass(purchaseId: string, ispId: string): Promise<boolean> {
    const query = `
      DELETE FROM purchase_inward_slip_passes 
      WHERE purchase_id = $1 AND inward_slip_pass_id = $2
    `;
    const result = await db.query(query, [purchaseId, ispId]);
    const deleted = (result.rowCount || 0) > 0;
    if (deleted) {
      logger.info('Inward slip pass unlinked from purchase', { purchaseId, ispId });
    }
    return deleted;
  }

  /**
   * Get all inward slip pass IDs linked to a purchase
   */
  async getLinkedInwardSlipPassIds(purchaseId: string): Promise<string[]> {
    const query = `
      SELECT inward_slip_pass_id 
      FROM purchase_inward_slip_passes 
      WHERE purchase_id = $1
    `;
    const result = await db.query<{ inward_slip_pass_id: string }>(query, [purchaseId]);
    return result.rows.map(row => row.inward_slip_pass_id);
  }

  /**
   * Get all purchase IDs linked to an inward slip pass
   */
  async getLinkedPurchaseIds(ispId: string): Promise<string[]> {
    const query = `
      SELECT purchase_id 
      FROM purchase_inward_slip_passes 
      WHERE inward_slip_pass_id = $1
    `;
    const result = await db.query<{ purchase_id: string }>(query, [ispId]);
    return result.rows.map(row => row.purchase_id);
  }

  /**
   * Check if an inward slip pass is linked to a purchase
   */
  async isLinked(purchaseId: string, ispId: string): Promise<boolean> {
    const query = `
      SELECT 1 FROM purchase_inward_slip_passes 
      WHERE purchase_id = $1 AND inward_slip_pass_id = $2 
      LIMIT 1
    `;
    const result = await db.query(query, [purchaseId, ispId]);
    return result.rows.length > 0;
  }

  /**
   * Get all junction records for a purchase
   */
  async findByPurchaseId(purchaseId: string): Promise<PurchaseInwardSlipPass[]> {
    const query = `
      SELECT id, purchase_id, inward_slip_pass_id, created_at
      FROM purchase_inward_slip_passes
      WHERE purchase_id = $1
      ORDER BY created_at ASC
    `;
    const result = await db.query<PurchaseInwardSlipPass>(query, [purchaseId]);
    return result.rows;
  }

  /**
   * Delete all links for a purchase (used when deleting purchase)
   */
  async deleteByPurchaseId(purchaseId: string): Promise<number> {
    const query = `DELETE FROM purchase_inward_slip_passes WHERE purchase_id = $1`;
    const result = await db.query(query, [purchaseId]);
    return result.rowCount || 0;
  }
}

export const purchaseInwardSlipPassDAO = new PurchaseInwardSlipPassDAO();

