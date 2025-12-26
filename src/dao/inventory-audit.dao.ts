import { db } from '../database/connection';
import { 
  LotInventoryAudit, 
  CreateLotInventoryAuditDTO,
  PacketsInventoryAudit,
  CreatePacketsInventoryAuditDTO,
  BagsInventoryAudit,
  CreateBagsInventoryAuditDTO,
  FinishedGoodsInventoryAudit,
  CreateFinishedGoodsInventoryAuditDTO
} from '../models/inventory-audit.model';
import { logger } from '../utils/logger';

// =====================================================
// LOT INVENTORY AUDIT DAO
// =====================================================

export class LotInventoryAuditDAO {
  async create(data: CreateLotInventoryAuditDTO): Promise<LotInventoryAudit> {
    const query = `
      INSERT INTO lot_inventory_audit (
        lot_inventory_id, lot_id, operation_type, quantity_change,
        quantity_before, quantity_after, reason, reference_type,
        reference_id, batch_id, batch_number, notes, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `;
    
    const values = [
      data.lot_inventory_id || null,
      data.lot_id,
      data.operation_type,
      data.quantity_change,
      data.quantity_before,
      data.quantity_after,
      data.reason,
      data.reference_type || null,
      data.reference_id || null,
      data.batch_id || null,
      data.batch_number || null,
      data.notes || null,
      data.created_by || null
    ];

    try {
      const result = await db.query<LotInventoryAudit>(query, values);
      logger.info('Lot inventory audit created', { 
        id: result.rows[0].id, 
        lot_id: data.lot_id,
        operation_type: data.operation_type 
      });
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating lot inventory audit', { error, data });
      throw error;
    }
  }

  async findByLotId(lotId: string, limit = 100): Promise<LotInventoryAudit[]> {
    const query = `
      SELECT lia.*, 
             l.lot_number, l.rice_code_id, l.rice_type,
             u.full_name as user_name
      FROM lot_inventory_audit lia
      LEFT JOIN inward_slip_lots l ON lia.lot_id = l.id
      LEFT JOIN users u ON lia.created_by = u.id
      WHERE lia.lot_id = $1
      ORDER BY lia.created_at DESC
      LIMIT $2
    `;
    const result = await db.query<LotInventoryAudit>(query, [lotId, limit]);
    return result.rows;
  }

  async findByLotInventoryId(lotInventoryId: string, limit = 100): Promise<LotInventoryAudit[]> {
    const query = `
      SELECT lia.*, 
             l.lot_number, l.rice_code_id, l.rice_type,
             u.full_name as user_name
      FROM lot_inventory_audit lia
      LEFT JOIN inward_slip_lots l ON lia.lot_id = l.id
      LEFT JOIN users u ON lia.created_by = u.id
      WHERE lia.lot_inventory_id = $1
      ORDER BY lia.created_at DESC
      LIMIT $2
    `;
    const result = await db.query<LotInventoryAudit>(query, [lotInventoryId, limit]);
    return result.rows;
  }

  async findByBatchId(batchId: string): Promise<LotInventoryAudit[]> {
    const query = `
      SELECT lia.*, 
             l.lot_number, l.rice_code_id, l.rice_type,
             u.full_name as user_name
      FROM lot_inventory_audit lia
      LEFT JOIN inward_slip_lots l ON lia.lot_id = l.id
      LEFT JOIN users u ON lia.created_by = u.id
      WHERE lia.batch_id = $1
      ORDER BY lia.created_at DESC
    `;
    const result = await db.query<LotInventoryAudit>(query, [batchId]);
    return result.rows;
  }

  async findRecent(limit = 100): Promise<LotInventoryAudit[]> {
    const query = `
      SELECT lia.*, 
             l.lot_number, l.rice_code_id, l.rice_type,
             u.full_name as user_name
      FROM lot_inventory_audit lia
      LEFT JOIN inward_slip_lots l ON lia.lot_id = l.id
      LEFT JOIN users u ON lia.created_by = u.id
      ORDER BY lia.created_at DESC
      LIMIT $1
    `;
    const result = await db.query<LotInventoryAudit>(query, [limit]);
    return result.rows;
  }
}

// =====================================================
// PACKETS INVENTORY AUDIT DAO
// =====================================================

export class PacketsInventoryAuditDAO {
  async create(data: CreatePacketsInventoryAuditDTO): Promise<PacketsInventoryAudit> {
    const query = `
      INSERT INTO packets_inventory_audit (
        packets_inventory_id, packaging_id, operation_type, quantity_change,
        quantity_before, quantity_after, reason, reference_type,
        reference_id, batch_id, batch_number, notes, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `;
    
    const values = [
      data.packets_inventory_id || null,
      data.packaging_id,
      data.operation_type,
      data.quantity_change,
      data.quantity_before,
      data.quantity_after,
      data.reason,
      data.reference_type || null,
      data.reference_id || null,
      data.batch_id || null,
      data.batch_number || null,
      data.notes || null,
      data.created_by || null
    ];

    try {
      const result = await db.query<PacketsInventoryAudit>(query, values);
      logger.info('Packets inventory audit created', { 
        id: result.rows[0].id, 
        packaging_id: data.packaging_id,
        operation_type: data.operation_type 
      });
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating packets inventory audit', { error, data });
      throw error;
    }
  }

  async findByPackagingId(packagingId: string, limit = 100): Promise<PacketsInventoryAudit[]> {
    const query = `
      SELECT pia.*, 
             p.holding_capacity, p.packet_type,
             u.full_name as user_name
      FROM packets_inventory_audit pia
      LEFT JOIN packaging p ON pia.packaging_id = p.id
      LEFT JOIN users u ON pia.created_by = u.id
      WHERE pia.packaging_id = $1
      ORDER BY pia.created_at DESC
      LIMIT $2
    `;
    const result = await db.query<PacketsInventoryAudit>(query, [packagingId, limit]);
    return result.rows;
  }

  async findByPacketsInventoryId(packetsInventoryId: string, limit = 100): Promise<PacketsInventoryAudit[]> {
    const query = `
      SELECT pia.*, 
             p.holding_capacity, p.packet_type,
             u.full_name as user_name
      FROM packets_inventory_audit pia
      LEFT JOIN packaging p ON pia.packaging_id = p.id
      LEFT JOIN users u ON pia.created_by = u.id
      WHERE pia.packets_inventory_id = $1
      ORDER BY pia.created_at DESC
      LIMIT $2
    `;
    const result = await db.query<PacketsInventoryAudit>(query, [packetsInventoryId, limit]);
    return result.rows;
  }

  async findByBatchId(batchId: string): Promise<PacketsInventoryAudit[]> {
    const query = `
      SELECT pia.*, 
             p.holding_capacity, p.packet_type,
             u.full_name as user_name
      FROM packets_inventory_audit pia
      LEFT JOIN packaging p ON pia.packaging_id = p.id
      LEFT JOIN users u ON pia.created_by = u.id
      WHERE pia.batch_id = $1
      ORDER BY pia.created_at DESC
    `;
    const result = await db.query<PacketsInventoryAudit>(query, [batchId]);
    return result.rows;
  }

  async findRecent(limit = 100): Promise<PacketsInventoryAudit[]> {
    const query = `
      SELECT pia.*, 
             p.holding_capacity, p.packet_type,
             u.full_name as user_name
      FROM packets_inventory_audit pia
      LEFT JOIN packaging p ON pia.packaging_id = p.id
      LEFT JOIN users u ON pia.created_by = u.id
      ORDER BY pia.created_at DESC
      LIMIT $1
    `;
    const result = await db.query<PacketsInventoryAudit>(query, [limit]);
    return result.rows;
  }
}

// =====================================================
// BAGS INVENTORY AUDIT DAO
// =====================================================

export class BagsInventoryAuditDAO {
  async create(data: CreateBagsInventoryAuditDTO): Promise<BagsInventoryAudit> {
    const query = `
      INSERT INTO bags_inventory_audit (
        bags_inventory_id, bag_type, bag_capacity, operation_type, field_changed,
        quantity_change, quantity_before, quantity_after, reason, reference_type,
        reference_id, batch_id, batch_number, kaanta_id, notes, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `;
    
    const values = [
      data.bags_inventory_id || null,
      data.bag_type,
      data.bag_capacity,
      data.operation_type,
      data.field_changed,
      data.quantity_change,
      data.quantity_before,
      data.quantity_after,
      data.reason,
      data.reference_type || null,
      data.reference_id || null,
      data.batch_id || null,
      data.batch_number || null,
      data.kaanta_id || null,
      data.notes || null,
      data.created_by || null
    ];

    try {
      const result = await db.query<BagsInventoryAudit>(query, values);
      logger.info('Bags inventory audit created', { 
        id: result.rows[0].id, 
        bag_type: data.bag_type,
        bag_capacity: data.bag_capacity,
        operation_type: data.operation_type,
        field_changed: data.field_changed
      });
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating bags inventory audit', { error, data });
      throw error;
    }
  }

  async findByBagsInventoryId(bagsInventoryId: string, limit = 100): Promise<BagsInventoryAudit[]> {
    const query = `
      SELECT bia.*, 
             u.full_name as user_name,
             k.kaanta_id as kaanta_number,
             k.sauda_id as kaanta_sauda_id,
             k.inward_slip_pass_id as kaanta_isp_id
      FROM bags_inventory_audit bia
      LEFT JOIN users u ON bia.created_by = u.id
      LEFT JOIN kaantas k ON bia.kaanta_id = k.id
      WHERE bia.bags_inventory_id = $1
      ORDER BY bia.created_at DESC
      LIMIT $2
    `;
    const result = await db.query<BagsInventoryAudit>(query, [bagsInventoryId, limit]);
    return result.rows;
  }

  async findByBagTypeAndCapacity(bagType: string, bagCapacity: number, limit = 100): Promise<BagsInventoryAudit[]> {
    const query = `
      SELECT bia.*, 
             u.full_name as user_name,
             k.kaanta_id as kaanta_number,
             k.sauda_id as kaanta_sauda_id,
             k.inward_slip_pass_id as kaanta_isp_id
      FROM bags_inventory_audit bia
      LEFT JOIN users u ON bia.created_by = u.id
      LEFT JOIN kaantas k ON bia.kaanta_id = k.id
      WHERE bia.bag_type = $1 AND bia.bag_capacity = $2
      ORDER BY bia.created_at DESC
      LIMIT $3
    `;
    const result = await db.query<BagsInventoryAudit>(query, [bagType, bagCapacity, limit]);
    return result.rows;
  }

  async findByBatchId(batchId: string): Promise<BagsInventoryAudit[]> {
    const query = `
      SELECT bia.*, 
             u.full_name as user_name,
             k.kaanta_id as kaanta_number,
             k.sauda_id as kaanta_sauda_id,
             k.inward_slip_pass_id as kaanta_isp_id
      FROM bags_inventory_audit bia
      LEFT JOIN users u ON bia.created_by = u.id
      LEFT JOIN kaantas k ON bia.kaanta_id = k.id
      WHERE bia.batch_id = $1
      ORDER BY bia.created_at DESC
    `;
    const result = await db.query<BagsInventoryAudit>(query, [batchId]);
    return result.rows;
  }

  async findByKaantaId(kaantaId: string): Promise<BagsInventoryAudit[]> {
    const query = `
      SELECT bia.*, 
             u.full_name as user_name,
             k.kaanta_id as kaanta_number,
             k.sauda_id as kaanta_sauda_id,
             k.inward_slip_pass_id as kaanta_isp_id
      FROM bags_inventory_audit bia
      LEFT JOIN users u ON bia.created_by = u.id
      LEFT JOIN kaantas k ON bia.kaanta_id = k.id
      WHERE bia.kaanta_id = $1
      ORDER BY bia.created_at DESC
    `;
    const result = await db.query<BagsInventoryAudit>(query, [kaantaId]);
    return result.rows;
  }

  async findRecent(limit = 100): Promise<BagsInventoryAudit[]> {
    const query = `
      SELECT bia.*, 
             u.full_name as user_name,
             k.kaanta_id as kaanta_number,
             k.sauda_id as kaanta_sauda_id,
             k.inward_slip_pass_id as kaanta_isp_id
      FROM bags_inventory_audit bia
      LEFT JOIN users u ON bia.created_by = u.id
      LEFT JOIN kaantas k ON bia.kaanta_id = k.id
      ORDER BY bia.created_at DESC
      LIMIT $1
    `;
    const result = await db.query<BagsInventoryAudit>(query, [limit]);
    return result.rows;
  }
}

// =====================================================
// FINISHED GOODS INVENTORY AUDIT DAO
// =====================================================

export class FinishedGoodsInventoryAuditDAO {
  async create(data: CreateFinishedGoodsInventoryAuditDTO): Promise<FinishedGoodsInventoryAudit> {
    const query = `
      INSERT INTO finished_goods_inventory_audit (
        finished_goods_inventory_id, product_id, batch_id, batch_number, packaging_id,
        operation_type, packets_change, packets_before, packets_after,
        weight_change, weight_before, weight_after, reason, reference_type,
        reference_id, notes, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
    `;
    
    const values = [
      data.finished_goods_inventory_id || null,
      data.product_id,
      data.batch_id || null,
      data.batch_number || null,
      data.packaging_id || null,
      data.operation_type,
      data.packets_change,
      data.packets_before,
      data.packets_after,
      data.weight_change,
      data.weight_before,
      data.weight_after,
      data.reason,
      data.reference_type || null,
      data.reference_id || null,
      data.notes || null,
      data.created_by || null
    ];

    try {
      const result = await db.query<FinishedGoodsInventoryAudit>(query, values);
      logger.info('Finished goods inventory audit created', { 
        id: result.rows[0].id, 
        product_id: data.product_id,
        operation_type: data.operation_type 
      });
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating finished goods inventory audit', { error, data });
      throw error;
    }
  }

  async findByProductId(productId: string, limit = 100): Promise<FinishedGoodsInventoryAudit[]> {
    const query = `
      SELECT fgia.*, 
             pr.name as product_name,
             p.holding_capacity, p.packet_type,
             u.full_name as user_name
      FROM finished_goods_inventory_audit fgia
      LEFT JOIN products pr ON fgia.product_id = pr.id
      LEFT JOIN packaging p ON fgia.packaging_id = p.id
      LEFT JOIN users u ON fgia.created_by = u.id
      WHERE fgia.product_id = $1
      ORDER BY fgia.created_at DESC
      LIMIT $2
    `;
    const result = await db.query<FinishedGoodsInventoryAudit>(query, [productId, limit]);
    return result.rows;
  }

  async findByBatchId(batchId: string): Promise<FinishedGoodsInventoryAudit[]> {
    const query = `
      SELECT fgia.*, 
             pr.name as product_name,
             p.holding_capacity, p.packet_type,
             u.full_name as user_name
      FROM finished_goods_inventory_audit fgia
      LEFT JOIN products pr ON fgia.product_id = pr.id
      LEFT JOIN packaging p ON fgia.packaging_id = p.id
      LEFT JOIN users u ON fgia.created_by = u.id
      WHERE fgia.batch_id = $1
      ORDER BY fgia.created_at DESC
    `;
    const result = await db.query<FinishedGoodsInventoryAudit>(query, [batchId]);
    return result.rows;
  }

  async findByFinishedGoodsInventoryId(fgInventoryId: string, limit = 100): Promise<FinishedGoodsInventoryAudit[]> {
    const query = `
      SELECT fgia.*, 
             pr.name as product_name,
             p.holding_capacity, p.packet_type,
             u.full_name as user_name
      FROM finished_goods_inventory_audit fgia
      LEFT JOIN products pr ON fgia.product_id = pr.id
      LEFT JOIN packaging p ON fgia.packaging_id = p.id
      LEFT JOIN users u ON fgia.created_by = u.id
      WHERE fgia.finished_goods_inventory_id = $1
      ORDER BY fgia.created_at DESC
      LIMIT $2
    `;
    const result = await db.query<FinishedGoodsInventoryAudit>(query, [fgInventoryId, limit]);
    return result.rows;
  }

  async findRecent(limit = 100): Promise<FinishedGoodsInventoryAudit[]> {
    const query = `
      SELECT fgia.*, 
             pr.name as product_name,
             p.holding_capacity, p.packet_type,
             u.full_name as user_name
      FROM finished_goods_inventory_audit fgia
      LEFT JOIN products pr ON fgia.product_id = pr.id
      LEFT JOIN packaging p ON fgia.packaging_id = p.id
      LEFT JOIN users u ON fgia.created_by = u.id
      ORDER BY fgia.created_at DESC
      LIMIT $1
    `;
    const result = await db.query<FinishedGoodsInventoryAudit>(query, [limit]);
    return result.rows;
  }
}

// Export singleton instances
export const lotInventoryAuditDAO = new LotInventoryAuditDAO();
export const packetsInventoryAuditDAO = new PacketsInventoryAuditDAO();
export const bagsInventoryAuditDAO = new BagsInventoryAuditDAO();
export const finishedGoodsInventoryAuditDAO = new FinishedGoodsInventoryAuditDAO();

