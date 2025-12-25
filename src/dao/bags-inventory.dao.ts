import { db } from '../database/connection';
import { BagsInventory, CreateBagsInventoryDTO, UpdateBagsInventoryDTO } from '../models/bags-inventory.model';
import { BagType } from '../models/kaanta.model';
import { logger } from '../utils/logger';

export class BagsInventoryDAO {
  async findAll(bagType?: BagType): Promise<BagsInventory[]> {
    let query = `
      SELECT id, bag_type, bag_capacity, filled_bags, empty_bags, created_at, updated_at, created_by, updated_by
      FROM bags_inventory
      WHERE 1=1
    `;
    
    const params: any[] = [];
    let paramCount = 1;

    if (bagType) {
      query += ` AND bag_type = $${paramCount++}`;
      params.push(bagType);
    }

    query += ` ORDER BY bag_type ASC, bag_capacity ASC`;

    const result = await db.query<BagsInventory>(query, params);
    return result.rows;
  }

  async findById(id: string): Promise<BagsInventory | null> {
    const query = `
      SELECT id, bag_type, bag_capacity, filled_bags, empty_bags, created_at, updated_at, created_by, updated_by
      FROM bags_inventory
      WHERE id = $1
    `;
    const result = await db.query<BagsInventory>(query, [id]);
    return result.rows[0] || null;
  }

  async findByTypeAndCapacity(bagType: BagType, bagCapacity: number): Promise<BagsInventory | null> {
    const query = `
      SELECT id, bag_type, bag_capacity, filled_bags, empty_bags, created_at, updated_at, created_by, updated_by
      FROM bags_inventory
      WHERE bag_type = $1 AND bag_capacity = $2
    `;
    const result = await db.query<BagsInventory>(query, [bagType, bagCapacity]);
    return result.rows[0] || null;
  }

  async create(inventoryData: CreateBagsInventoryDTO): Promise<BagsInventory> {
    const query = `
      INSERT INTO bags_inventory (bag_type, bag_capacity, filled_bags, empty_bags, created_by)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (bag_type, bag_capacity) 
      DO UPDATE SET filled_bags = bags_inventory.filled_bags + EXCLUDED.filled_bags,
                    empty_bags = bags_inventory.empty_bags + EXCLUDED.empty_bags,
                    updated_at = CURRENT_TIMESTAMP
      RETURNING id, bag_type, bag_capacity, filled_bags, empty_bags, created_at, updated_at, created_by, updated_by
    `;
    
    const values = [
      inventoryData.bag_type,
      inventoryData.bag_capacity,
      inventoryData.filled_bags || 0,
      inventoryData.empty_bags || 0,
      inventoryData.created_by || null
    ];

    try {
      const result = await db.query<BagsInventory>(query, values);
      logger.info('Bags inventory created/updated', { id: result.rows[0].id });
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating bags inventory', { error, inventoryData });
      throw error;
    }
  }

  async update(id: string, inventoryData: UpdateBagsInventoryDTO): Promise<BagsInventory | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (inventoryData.filled_bags !== undefined) {
      fields.push(`filled_bags = $${paramCount++}`);
      values.push(inventoryData.filled_bags);
    }
    if (inventoryData.empty_bags !== undefined) {
      fields.push(`empty_bags = $${paramCount++}`);
      values.push(inventoryData.empty_bags);
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
      UPDATE bags_inventory
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, bag_type, bag_capacity, filled_bags, empty_bags, created_at, updated_at, created_by, updated_by
    `;

    try {
      const result = await db.query<BagsInventory>(query, values);
      if (result.rows.length === 0) {
        return null;
      }
      logger.info('Bags inventory updated', { id });
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating bags inventory', { error, id });
      throw error;
    }
  }

  async decrementFilledBags(bagType: BagType, bagCapacity: number, quantity: number): Promise<boolean> {
    const query = `
      UPDATE bags_inventory
      SET filled_bags = filled_bags - $1, updated_at = CURRENT_TIMESTAMP
      WHERE bag_type = $2 AND bag_capacity = $3 AND filled_bags >= $1
    `;
    const result = await db.query(query, [quantity, bagType, bagCapacity]);
    return (result.rowCount || 0) > 0;
  }

  async incrementEmptyBags(bagType: BagType, bagCapacity: number, quantity: number): Promise<boolean> {
    const query = `
      UPDATE bags_inventory
      SET empty_bags = empty_bags + $1, updated_at = CURRENT_TIMESTAMP
      WHERE bag_type = $2 AND bag_capacity = $3
    `;
    const result = await db.query(query, [quantity, bagType, bagCapacity]);
    return (result.rowCount || 0) > 0;
  }
}

export const bagsInventoryDAO = new BagsInventoryDAO();

