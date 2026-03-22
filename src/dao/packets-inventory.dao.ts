import { db } from '../database/connection';
import { PacketsInventory, CreatePacketsInventoryDTO, UpdatePacketsInventoryDTO } from '../models/packets-inventory.model';
import { logger } from '../utils/logger';

/** Join row for enriching packaging GET responses (packets_inventory + godowns). */
export interface PackagingGodownInventoryRow {
  packaging_id: string;
  godown_id: string;
  godown_name: string;
  available_quantity: number;
}

export class PacketsInventoryDAO {
  async findAll(godownId?: string): Promise<PacketsInventory[]> {
    const query = `
      SELECT id, godown_id, packaging_id, available_quantity, created_at, updated_at, created_by, updated_by
      FROM packets_inventory
      WHERE ($1::uuid IS NULL OR godown_id = $1)
      ORDER BY packaging_id ASC
    `;
    const result = await db.query<PacketsInventory>(query, [godownId ?? null]);
    return result.rows;
  }

  async findById(id: string): Promise<PacketsInventory | null> {
    const query = `
      SELECT id, godown_id, packaging_id, available_quantity, created_at, updated_at, created_by, updated_by
      FROM packets_inventory
      WHERE id = $1
    `;
    const result = await db.query<PacketsInventory>(query, [id]);
    return result.rows[0] || null;
  }

  /**
   * All godowns that hold empty-packet stock for the given packaging IDs (batch-friendly for list endpoints).
   */
  async findGodownSummariesByPackagingIds(packagingIds: string[]): Promise<PackagingGodownInventoryRow[]> {
    if (packagingIds.length === 0) {
      return [];
    }
    const query = `
      SELECT
        pi.packaging_id,
        pi.godown_id,
        g.name AS godown_name,
        pi.available_quantity
      FROM packets_inventory pi
      INNER JOIN godowns g ON g.id = pi.godown_id
      WHERE pi.packaging_id = ANY($1::uuid[])
      ORDER BY pi.packaging_id ASC, g.name ASC
    `;
    const result = await db.query<PackagingGodownInventoryRow>(query, [packagingIds]);
    return result.rows.map((row) => ({
      ...row,
      available_quantity: Number(row.available_quantity),
    }));
  }

  async findByPackagingId(packagingId: string, godownId?: string): Promise<PacketsInventory | null> {
    const query = `
      SELECT id, godown_id, packaging_id, available_quantity, created_at, updated_at, created_by, updated_by
      FROM packets_inventory
      WHERE packaging_id = $1
      AND ($2::uuid IS NULL OR godown_id = $2)
    `;
    const result = await db.query<PacketsInventory>(query, [packagingId, godownId ?? null]);
    return result.rows[0] || null;
  }

  async create(inventoryData: CreatePacketsInventoryDTO): Promise<PacketsInventory> {
    const query = `
      INSERT INTO packets_inventory (godown_id, packaging_id, available_quantity, created_by)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (godown_id, packaging_id) 
      DO UPDATE SET available_quantity = packets_inventory.available_quantity + EXCLUDED.available_quantity,
                    updated_at = CURRENT_TIMESTAMP
      RETURNING id, godown_id, packaging_id, available_quantity, created_at, updated_at, created_by, updated_by
    `;
    
    const effectiveGodownId =
      inventoryData.godown_id ??
      (
        await db.query<{ id: string }>('SELECT id FROM godowns ORDER BY created_at ASC LIMIT 1')
      ).rows[0]?.id;

    const values = [
      effectiveGodownId,
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
      RETURNING id, godown_id, packaging_id, available_quantity, created_at, updated_at, created_by, updated_by
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

  async decrementQuantity(packagingId: string, quantity: number, godownId?: string): Promise<boolean> {
    const query = `
      UPDATE packets_inventory
      SET available_quantity = available_quantity - $1, updated_at = CURRENT_TIMESTAMP
      WHERE packaging_id = $2 AND ($3::uuid IS NULL OR godown_id = $3) AND available_quantity >= $1
    `;
    const result = await db.query(query, [quantity, packagingId, godownId ?? null]);
    return (result.rowCount || 0) > 0;
  }

  async incrementQuantity(packagingId: string, quantity: number, godownId?: string): Promise<boolean> {
    const query = `
      UPDATE packets_inventory
      SET available_quantity = available_quantity + $1, updated_at = CURRENT_TIMESTAMP
      WHERE packaging_id = $2 AND ($3::uuid IS NULL OR godown_id = $3)
    `;
    const result = await db.query(query, [quantity, packagingId, godownId ?? null]);
    return (result.rowCount || 0) > 0;
  }

  // Set initial stock (used when creating new packaging with initial_packets)
  async setInitialStock(packagingId: string, quantity: number, godownId?: string, createdBy?: string): Promise<PacketsInventory> {
    const query = `
      INSERT INTO packets_inventory (godown_id, packaging_id, available_quantity, created_by)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (godown_id, packaging_id) 
      DO UPDATE SET available_quantity = EXCLUDED.available_quantity,
                    updated_at = CURRENT_TIMESTAMP
      RETURNING id, godown_id, packaging_id, available_quantity, created_at, updated_at, created_by, updated_by
    `;
    
    const effectiveGodownId =
      godownId ??
      (
        await db.query<{ id: string }>('SELECT id FROM godowns ORDER BY created_at ASC LIMIT 1')
      ).rows[0]?.id;
    const result = await db.query<PacketsInventory>(query, [effectiveGodownId, packagingId, quantity, createdBy || null]);
    logger.info('Packets inventory initial stock set', { packaging_id: packagingId, quantity });
    return result.rows[0];
  }
}

export const packetsInventoryDAO = new PacketsInventoryDAO();

