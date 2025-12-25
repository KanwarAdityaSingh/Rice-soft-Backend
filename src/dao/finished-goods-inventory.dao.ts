import { db } from '../database/connection';
import { FinishedGoodsInventory, CreateFinishedGoodsInventoryDTO } from '../models/finished-goods-inventory.model';
import { logger } from '../utils/logger';

export class FinishedGoodsInventoryDAO {
  async findAll(productId?: string, batchId?: string): Promise<FinishedGoodsInventory[]> {
    let query = `
      SELECT id, product_id, batch_id, packaging_id, no_of_packets, total_weight,
             created_at, updated_at, created_by, updated_by
      FROM finished_goods_inventory
      WHERE 1=1
    `;
    
    const params: any[] = [];
    let paramCount = 1;

    if (productId) {
      query += ` AND product_id = $${paramCount++}`;
      params.push(productId);
    }
    if (batchId) {
      query += ` AND batch_id = $${paramCount++}`;
      params.push(batchId);
    }

    query += ` ORDER BY created_at DESC`;

    const result = await db.query<FinishedGoodsInventory>(query, params);
    return result.rows;
  }

  async findById(id: string): Promise<FinishedGoodsInventory | null> {
    const query = `
      SELECT id, product_id, batch_id, packaging_id, no_of_packets, total_weight,
             created_at, updated_at, created_by, updated_by
      FROM finished_goods_inventory
      WHERE id = $1
    `;
    const result = await db.query<FinishedGoodsInventory>(query, [id]);
    return result.rows[0] || null;
  }

  async findByBatchId(batchId: string): Promise<FinishedGoodsInventory | null> {
    const query = `
      SELECT id, product_id, batch_id, packaging_id, no_of_packets, total_weight,
             created_at, updated_at, created_by, updated_by
      FROM finished_goods_inventory
      WHERE batch_id = $1
    `;
    const result = await db.query<FinishedGoodsInventory>(query, [batchId]);
    return result.rows[0] || null;
  }

  async create(inventoryData: CreateFinishedGoodsInventoryDTO): Promise<FinishedGoodsInventory> {
    const query = `
      INSERT INTO finished_goods_inventory (product_id, batch_id, packaging_id, no_of_packets, total_weight, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, product_id, batch_id, packaging_id, no_of_packets, total_weight,
                created_at, updated_at, created_by, updated_by
    `;
    
    const values = [
      inventoryData.product_id,
      inventoryData.batch_id,
      inventoryData.packaging_id,
      inventoryData.no_of_packets,
      inventoryData.total_weight,
      inventoryData.created_by || null
    ];

    try {
      const result = await db.query<FinishedGoodsInventory>(query, values);
      logger.info('Finished goods inventory created', { id: result.rows[0].id });
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating finished goods inventory', { error, inventoryData });
      throw error;
    }
  }

  async updateQuantity(id: string, noOfPackets: number, totalWeight: number): Promise<FinishedGoodsInventory | null> {
    const query = `
      UPDATE finished_goods_inventory
      SET no_of_packets = $1, total_weight = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING id, product_id, batch_id, packaging_id, no_of_packets, total_weight,
                created_at, updated_at, created_by, updated_by
    `;
    const result = await db.query<FinishedGoodsInventory>(query, [noOfPackets, totalWeight, id]);
    return result.rows[0] || null;
  }
}

export const finishedGoodsInventoryDAO = new FinishedGoodsInventoryDAO();

