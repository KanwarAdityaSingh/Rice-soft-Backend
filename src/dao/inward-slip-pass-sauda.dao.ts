import { db } from '../database/connection';
import { logger } from '../utils/logger';

export class InwardSlipPassSaudaDAO {
  /**
   * Link multiple saudas to an inward slip pass
   */
  async linkSaudas(inwardSlipPassId: string, saudaIds: string[]): Promise<void> {
    if (saudaIds.length === 0) return;
    
    const values: string[] = [];
    const placeholders: string[] = [];
    let paramCount = 1;
    
    for (const saudaId of saudaIds) {
      placeholders.push(`($${paramCount++}, $${paramCount++})`);
      values.push(inwardSlipPassId, saudaId);
    }
    
    const query = `
      INSERT INTO inward_slip_pass_saudas (inward_slip_pass_id, sauda_id)
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (inward_slip_pass_id, sauda_id) DO NOTHING
    `;
    
    await db.query(query, values);
    logger.info('Saudas linked to inward slip pass', { inwardSlipPassId, saudaIds });
  }

  /**
   * Unlink a sauda from an inward slip pass
   */
  async unlinkSauda(inwardSlipPassId: string, saudaId: string): Promise<boolean> {
    const query = `
      DELETE FROM inward_slip_pass_saudas
      WHERE inward_slip_pass_id = $1 AND sauda_id = $2
    `;
    
    const result = await db.query(query, [inwardSlipPassId, saudaId]);
    const deleted = (result.rowCount || 0) > 0;
    
    if (deleted) {
      logger.info('Sauda unlinked from inward slip pass', { inwardSlipPassId, saudaId });
    }
    
    return deleted;
  }

  /**
   * Get all saudas linked to an inward slip pass
   */
  async getLinkedSaudaIds(inwardSlipPassId: string): Promise<string[]> {
    const query = `
      SELECT sauda_id
      FROM inward_slip_pass_saudas
      WHERE inward_slip_pass_id = $1
      ORDER BY created_at ASC
    `;
    
    const result = await db.query<{ sauda_id: string }>(query, [inwardSlipPassId]);
    return result.rows.map(row => row.sauda_id);
  }

  /**
   * Get all inward slip passes linked to a sauda
   */
  async getLinkedInwardSlipPassIds(saudaId: string): Promise<string[]> {
    const query = `
      SELECT inward_slip_pass_id
      FROM inward_slip_pass_saudas
      WHERE sauda_id = $1
      ORDER BY created_at ASC
    `;
    
    const result = await db.query<{ inward_slip_pass_id: string }>(query, [saudaId]);
    return result.rows.map(row => row.inward_slip_pass_id);
  }

  /**
   * Check if a sauda is linked to an inward slip pass
   */
  async isLinked(inwardSlipPassId: string, saudaId: string): Promise<boolean> {
    const query = `
      SELECT 1
      FROM inward_slip_pass_saudas
      WHERE inward_slip_pass_id = $1 AND sauda_id = $2
      LIMIT 1
    `;
    
    const result = await db.query(query, [inwardSlipPassId, saudaId]);
    return result.rows.length > 0;
  }

  /**
   * Remove all saudas from an inward slip pass
   */
  async unlinkAllSaudas(inwardSlipPassId: string): Promise<void> {
    const query = `
      DELETE FROM inward_slip_pass_saudas
      WHERE inward_slip_pass_id = $1
    `;
    
    await db.query(query, [inwardSlipPassId]);
    logger.info('All saudas unlinked from inward slip pass', { inwardSlipPassId });
  }
}

export const inwardSlipPassSaudaDAO = new InwardSlipPassSaudaDAO();

