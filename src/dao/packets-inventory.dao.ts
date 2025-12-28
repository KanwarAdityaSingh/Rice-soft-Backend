import { db } from '../database/connection';
import { PacketsInventory, CreatePacketsInventoryDTO, UpdatePacketsInventoryDTO } from '../models/packets-inventory.model';
import { logger } from '../utils/logger';

export class PacketsInventoryDAO {
  async findAll(): Promise<PacketsInventory[]> {
    const query = `
      SELECT id, packaging_id, available_quantity, created_at, updated_at, created_by, updated_by
      FROM packets_inventory
      ORDER BY packaging_id ASC
    `;
    const result = await db.query<PacketsInventory>(query);
    return result.rows;
  }

  async findById(id: string): Promise<PacketsInventory | null> {
    const query = `
      SELECT id, packaging_id, available_quantity, created_at, updated_at, created_by, updated_by
      FROM packets_inventory
      WHERE id = $1
    `;
    const result = await db.query<PacketsInventory>(query, [id]);
    return result.rows[0] || null;
  }

  async findByPackagingId(packagingId: string): Promise<PacketsInventory | null> {
    const query = `
      SELECT id, packaging_id, available_quantity, created_at, updated_at, created_by, updated_by
      FROM packets_inventory
      WHERE packaging_id = $1
    `;
    const result = await db.query<PacketsInventory>(query, [packagingId]);
    return result.rows[0] || null;
  }

  async create(inventoryData: CreatePacketsInventoryDTO): Promise<PacketsInventory> {
    const query = `
      INSERT INTO packets_inventory (packaging_id, available_quantity, created_by)
      VALUES ($1, $2, $3)
      ON CONFLICT (packaging_id) 
      DO UPDATE SET available_quantity = packets_inventory.available_quantity + EXCLUDED.available_quantity,
                    updated_at = CURRENT_TIMESTAMP
      RETURNING id, packaging_id, available_quantity, created_at, updated_at, created_by, updated_by
    `;
    
    const values = [
      inventoryData.packaging_id,
      inventoryData.available_quantity,
      inventoryData.created_by || null
    ];

    try {
      const result = await db.query<PacketsInventory>(query, values);
      logger.info('Packets inventory created/updated', { id: result.rows[0].id });
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating packets inventory', { error, inventoryData });
      throw error;
    }
  }

  async update(id: string, inventoryData: UpdatePacketsInventoryDTO): Promise<PacketsInventory | null> {
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
      UPDATE packets_inventory
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, packaging_id, available_quantity, created_at, updated_at, created_by, updated_by
    `;

    try {
      const result = await db.query<PacketsInventory>(query, values);
      if (result.rows.length === 0) {
        return null;
      }
      logger.info('Packets inventory updated', { id });
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating packets inventory', { error, id });
      throw error;
    }
  }

  async decrementQuantity(packagingId: string, quantity: number): Promise<boolean> {
    const query = `
      UPDATE packets_inventory
      SET available_quantity = available_quantity - $1, updated_at = CURRENT_TIMESTAMP
      WHERE packaging_id = $2 AND available_quantity >= $1
    `;
    const result = await db.query(query, [quantity, packagingId]);
    return (result.rowCount || 0) > 0;
  }

  async incrementQuantity(packagingId: string, quantity: number): Promise<boolean> {
    const query = `
      UPDATE packets_inventory
      SET available_quantity = available_quantity + $1, updated_at = CURRENT_TIMESTAMP
      WHERE packaging_id = $2
    `;
    const result = await db.query(query, [quantity, packagingId]);
    return (result.rowCount || 0) > 0;
  }

  // Set initial stock (used when creating new packaging with initial_packets)
  async setInitialStock(packagingId: string, quantity: number, createdBy?: string): Promise<PacketsInventory> {
    const query = `
      INSERT INTO packets_inventory (packaging_id, available_quantity, created_by)
      VALUES ($1, $2, $3)
      ON CONFLICT (packaging_id) 
      DO UPDATE SET available_quantity = EXCLUDED.available_quantity,
                    updated_at = CURRENT_TIMESTAMP
      RETURNING id, packaging_id, available_quantity, created_at, updated_at, created_by, updated_by
    `;
    
    const result = await db.query<PacketsInventory>(query, [packagingId, quantity, createdBy || null]);
    logger.info('Packets inventory initial stock set', { packaging_id: packagingId, quantity });
    return result.rows[0];
  }
}

export const packetsInventoryDAO = new PacketsInventoryDAO();

