import { db } from '../database/connection';
import { LotInventory, CreateLotInventoryDTO, UpdateLotInventoryDTO } from '../models/lot-inventory.model';
import { logger } from '../utils/logger';

export class LotInventoryDAO {
  async findAll(godownId?: string): Promise<LotInventory[]> {
    const query = `
      SELECT id, godown_id, lot_id, available_quantity, created_at, updated_at, created_by, updated_by
      FROM lot_inventory
      WHERE ($1::uuid IS NULL OR godown_id = $1)
      ORDER BY lot_id ASC
    `;
    const result = await db.query<LotInventory>(query, [godownId ?? null]);
    return result.rows;
  }

  async findById(id: string): Promise<LotInventory | null> {
    const query = `
      SELECT id, godown_id, lot_id, available_quantity, created_at, updated_at, created_by, updated_by
      FROM lot_inventory
      WHERE id = $1
    `;
    const result = await db.query<LotInventory>(query, [id]);
    return result.rows[0] || null;
  }

  async findByLotId(lotId: string, godownId?: string): Promise<LotInventory | null> {
    const query = `
      SELECT id, godown_id, lot_id, available_quantity, created_at, updated_at, created_by, updated_by
      FROM lot_inventory
      WHERE lot_id = $1
      ${godownId ? 'AND godown_id = $2' : ''}
    `;
    const result = await db.query<LotInventory>(query, godownId ? [lotId, godownId] : [lotId]);
    return result.rows[0] || null;
  }

  async create(inventoryData: CreateLotInventoryDTO): Promise<LotInventory> {
    const query = `
      INSERT INTO lot_inventory (lot_id, godown_id, available_quantity, created_by)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (lot_id) DO NOTHING
      RETURNING id, godown_id, lot_id, available_quantity, created_at, updated_at, created_by, updated_by
    `;
    
    const values = [
      inventoryData.lot_id,
      inventoryData.godown_id,
      inventoryData.available_quantity,
      inventoryData.created_by || null
    ];

    try {
      const result = await db.query<LotInventory>(query, values);
      if (result.rows.length === 0) {
        // Already exists, return existing
        const existing = await this.findByLotId(inventoryData.lot_id, inventoryData.godown_id);
        if (!existing) {
          throw new Error('Failed to create lot inventory');
        }
        return existing;
      }
      logger.info('Lot inventory created', { id: result.rows[0].id });
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating lot inventory', { error, inventoryData });
      throw error;
    }
  }

  async update(id: string, inventoryData: UpdateLotInventoryDTO): Promise<LotInventory | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (inventoryData.available_quantity !== undefined) {
      fields.push(`available_quantity = $${paramCount++}`);
      values.push(inventoryData.available_quantity);
    }
    if (inventoryData.updated_by !== undefined) {
      fields.push(`updated_by = $${paramCount++}`);
      values.push(inventoryData.updated_by);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE lot_inventory
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, godown_id, lot_id, available_quantity, created_at, updated_at, created_by, updated_by
    `;

    try {
      const result = await db.query<LotInventory>(query, values);
      if (result.rows.length === 0) {
        return null;
      }
      logger.info('Lot inventory updated', { id });
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating lot inventory', { error, id });
      throw error;
    }
  }

  async decrementQuantity(lotId: string, quantity: number, godownId?: string): Promise<boolean> {
    const query = `
      UPDATE lot_inventory
      SET available_quantity = available_quantity - $1, updated_at = CURRENT_TIMESTAMP
      WHERE lot_id = $2 AND ($3::uuid IS NULL OR godown_id = $3) AND available_quantity >= $1
    `;
    const result = await db.query(query, [quantity, lotId, godownId ?? null]);
    return (result.rowCount || 0) > 0;
  }

  async getAvailableQuantity(lotId: string, godownId?: string): Promise<number> {
    const inventory = await this.findByLotId(lotId, godownId);
    return inventory ? inventory.available_quantity : 0;
  }
}

export const lotInventoryDAO = new LotInventoryDAO();

