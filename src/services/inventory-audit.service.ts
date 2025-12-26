import { 
  lotInventoryAuditDAO, 
  packetsInventoryAuditDAO, 
  bagsInventoryAuditDAO, 
  finishedGoodsInventoryAuditDAO 
} from '../dao/inventory-audit.dao';
import { 
  LotInventoryAudit,
  PacketsInventoryAudit,
  BagsInventoryAudit,
  FinishedGoodsInventoryAudit,
  LotInventoryAuditResponse,
  PacketsInventoryAuditResponse,
  BagsInventoryAuditResponse,
  FinishedGoodsInventoryAuditResponse
} from '../models/inventory-audit.model';

export class InventoryAuditService {
  // =====================================================
  // LOT INVENTORY AUDIT
  // =====================================================

  async getLotInventoryAuditByLotId(lotId: string, limit = 100): Promise<LotInventoryAuditResponse[]> {
    const audits = await lotInventoryAuditDAO.findByLotId(lotId, limit);
    return this.formatLotAuditResponse(audits);
  }

  async getLotInventoryAuditByLotInventoryId(lotInventoryId: string, limit = 100): Promise<LotInventoryAuditResponse[]> {
    const audits = await lotInventoryAuditDAO.findByLotInventoryId(lotInventoryId, limit);
    return this.formatLotAuditResponse(audits);
  }

  async getLotInventoryAuditByBatchId(batchId: string): Promise<LotInventoryAuditResponse[]> {
    const audits = await lotInventoryAuditDAO.findByBatchId(batchId);
    return this.formatLotAuditResponse(audits);
  }

  async getRecentLotInventoryAudit(limit = 100): Promise<LotInventoryAuditResponse[]> {
    const audits = await lotInventoryAuditDAO.findRecent(limit);
    return this.formatLotAuditResponse(audits);
  }

  private formatLotAuditResponse(audits: (LotInventoryAudit & { lot_number?: string; rice_code_id?: string; rice_type?: string; user_name?: string })[]): LotInventoryAuditResponse[] {
    return audits.map(audit => ({
      id: audit.id,
      lot_inventory_id: audit.lot_inventory_id,
      lot_id: audit.lot_id,
      operation_type: audit.operation_type,
      quantity_change: parseFloat(audit.quantity_change.toString()),
      quantity_before: parseFloat(audit.quantity_before.toString()),
      quantity_after: parseFloat(audit.quantity_after.toString()),
      reason: audit.reason,
      reference_type: audit.reference_type,
      reference_id: audit.reference_id,
      batch_id: audit.batch_id,
      batch_number: audit.batch_number,
      notes: audit.notes,
      created_at: audit.created_at instanceof Date ? audit.created_at.toISOString() : audit.created_at,
      created_by: audit.created_by,
      lot: audit.lot_number ? {
        id: audit.lot_id,
        lot_number: audit.lot_number,
        rice_code_id: audit.rice_code_id || null,
        rice_type: audit.rice_type || null
      } : undefined,
      user: audit.user_name ? {
        id: audit.created_by || '',
        name: audit.user_name
      } : undefined
    }));
  }

  // =====================================================
  // PACKETS INVENTORY AUDIT
  // =====================================================

  async getPacketsInventoryAuditByPackagingId(packagingId: string, limit = 100): Promise<PacketsInventoryAuditResponse[]> {
    const audits = await packetsInventoryAuditDAO.findByPackagingId(packagingId, limit);
    return this.formatPacketsAuditResponse(audits);
  }

  async getPacketsInventoryAuditByPacketsInventoryId(packetsInventoryId: string, limit = 100): Promise<PacketsInventoryAuditResponse[]> {
    const audits = await packetsInventoryAuditDAO.findByPacketsInventoryId(packetsInventoryId, limit);
    return this.formatPacketsAuditResponse(audits);
  }

  async getPacketsInventoryAuditByBatchId(batchId: string): Promise<PacketsInventoryAuditResponse[]> {
    const audits = await packetsInventoryAuditDAO.findByBatchId(batchId);
    return this.formatPacketsAuditResponse(audits);
  }

  async getRecentPacketsInventoryAudit(limit = 100): Promise<PacketsInventoryAuditResponse[]> {
    const audits = await packetsInventoryAuditDAO.findRecent(limit);
    return this.formatPacketsAuditResponse(audits);
  }

  private formatPacketsAuditResponse(audits: (PacketsInventoryAudit & { holding_capacity?: number; packet_type?: string; user_name?: string })[]): PacketsInventoryAuditResponse[] {
    return audits.map(audit => ({
      id: audit.id,
      packets_inventory_id: audit.packets_inventory_id,
      packaging_id: audit.packaging_id,
      operation_type: audit.operation_type,
      quantity_change: audit.quantity_change,
      quantity_before: audit.quantity_before,
      quantity_after: audit.quantity_after,
      reason: audit.reason,
      reference_type: audit.reference_type,
      reference_id: audit.reference_id,
      batch_id: audit.batch_id,
      batch_number: audit.batch_number,
      notes: audit.notes,
      created_at: audit.created_at instanceof Date ? audit.created_at.toISOString() : audit.created_at,
      created_by: audit.created_by,
      packaging: audit.holding_capacity !== undefined ? {
        id: audit.packaging_id,
        holding_capacity: parseFloat(audit.holding_capacity.toString()),
        packet_type: audit.packet_type || ''
      } : undefined,
      user: audit.user_name ? {
        id: audit.created_by || '',
        name: audit.user_name
      } : undefined
    }));
  }

  // =====================================================
  // BAGS INVENTORY AUDIT
  // =====================================================

  async getBagsInventoryAuditByBagsInventoryId(bagsInventoryId: string, limit = 100): Promise<BagsInventoryAuditResponse[]> {
    const audits = await bagsInventoryAuditDAO.findByBagsInventoryId(bagsInventoryId, limit);
    return this.formatBagsAuditResponse(audits);
  }

  async getBagsInventoryAuditByBagTypeAndCapacity(bagType: string, bagCapacity: number, limit = 100): Promise<BagsInventoryAuditResponse[]> {
    const audits = await bagsInventoryAuditDAO.findByBagTypeAndCapacity(bagType, bagCapacity, limit);
    return this.formatBagsAuditResponse(audits);
  }

  async getBagsInventoryAuditByBatchId(batchId: string): Promise<BagsInventoryAuditResponse[]> {
    const audits = await bagsInventoryAuditDAO.findByBatchId(batchId);
    return this.formatBagsAuditResponse(audits);
  }

  async getBagsInventoryAuditByKaantaId(kaantaId: string): Promise<BagsInventoryAuditResponse[]> {
    const audits = await bagsInventoryAuditDAO.findByKaantaId(kaantaId);
    return this.formatBagsAuditResponse(audits);
  }

  async getRecentBagsInventoryAudit(limit = 100): Promise<BagsInventoryAuditResponse[]> {
    const audits = await bagsInventoryAuditDAO.findRecent(limit);
    return this.formatBagsAuditResponse(audits);
  }

  private formatBagsAuditResponse(audits: (BagsInventoryAudit & { user_name?: string; kaanta_number?: string; kaanta_sauda_id?: string; kaanta_isp_id?: string })[]): BagsInventoryAuditResponse[] {
    return audits.map(audit => ({
      id: audit.id,
      bags_inventory_id: audit.bags_inventory_id,
      bag_type: audit.bag_type,
      bag_capacity: parseFloat(audit.bag_capacity.toString()),
      operation_type: audit.operation_type,
      field_changed: audit.field_changed,
      quantity_change: audit.quantity_change,
      quantity_before: audit.quantity_before,
      quantity_after: audit.quantity_after,
      reason: audit.reason,
      reference_type: audit.reference_type,
      reference_id: audit.reference_id,
      batch_id: audit.batch_id,
      batch_number: audit.batch_number,
      kaanta_id: audit.kaanta_id,
      kaanta_number: audit.kaanta_number,
      kaanta_sauda_id: audit.kaanta_sauda_id,
      kaanta_isp_id: audit.kaanta_isp_id,
      notes: audit.notes,
      created_at: audit.created_at instanceof Date ? audit.created_at.toISOString() : audit.created_at,
      created_by: audit.created_by,
      user: audit.user_name ? {
        id: audit.created_by || '',
        name: audit.user_name
      } : undefined
    }));
  }

  // =====================================================
  // FINISHED GOODS INVENTORY AUDIT
  // =====================================================

  async getFinishedGoodsInventoryAuditByProductId(productId: string, limit = 100): Promise<FinishedGoodsInventoryAuditResponse[]> {
    const audits = await finishedGoodsInventoryAuditDAO.findByProductId(productId, limit);
    return this.formatFinishedGoodsAuditResponse(audits);
  }

  async getFinishedGoodsInventoryAuditByBatchId(batchId: string): Promise<FinishedGoodsInventoryAuditResponse[]> {
    const audits = await finishedGoodsInventoryAuditDAO.findByBatchId(batchId);
    return this.formatFinishedGoodsAuditResponse(audits);
  }

  async getFinishedGoodsInventoryAuditByFGInventoryId(fgInventoryId: string, limit = 100): Promise<FinishedGoodsInventoryAuditResponse[]> {
    const audits = await finishedGoodsInventoryAuditDAO.findByFinishedGoodsInventoryId(fgInventoryId, limit);
    return this.formatFinishedGoodsAuditResponse(audits);
  }

  async getRecentFinishedGoodsInventoryAudit(limit = 100): Promise<FinishedGoodsInventoryAuditResponse[]> {
    const audits = await finishedGoodsInventoryAuditDAO.findRecent(limit);
    return this.formatFinishedGoodsAuditResponse(audits);
  }

  private formatFinishedGoodsAuditResponse(audits: (FinishedGoodsInventoryAudit & { product_name?: string; holding_capacity?: number; packet_type?: string; user_name?: string })[]): FinishedGoodsInventoryAuditResponse[] {
    return audits.map(audit => ({
      id: audit.id,
      finished_goods_inventory_id: audit.finished_goods_inventory_id,
      product_id: audit.product_id,
      batch_id: audit.batch_id,
      batch_number: audit.batch_number,
      packaging_id: audit.packaging_id,
      operation_type: audit.operation_type,
      packets_change: audit.packets_change,
      packets_before: audit.packets_before,
      packets_after: audit.packets_after,
      weight_change: parseFloat(audit.weight_change.toString()),
      weight_before: parseFloat(audit.weight_before.toString()),
      weight_after: parseFloat(audit.weight_after.toString()),
      reason: audit.reason,
      reference_type: audit.reference_type,
      reference_id: audit.reference_id,
      notes: audit.notes,
      created_at: audit.created_at instanceof Date ? audit.created_at.toISOString() : audit.created_at,
      created_by: audit.created_by,
      product: audit.product_name ? {
        id: audit.product_id,
        name: audit.product_name
      } : undefined,
      packaging: audit.holding_capacity !== undefined && audit.packaging_id ? {
        id: audit.packaging_id,
        holding_capacity: parseFloat(audit.holding_capacity.toString()),
        packet_type: audit.packet_type || ''
      } : undefined,
      user: audit.user_name ? {
        id: audit.created_by || '',
        name: audit.user_name
      } : undefined
    }));
  }

  // =====================================================
  // COMBINED AUDIT FOR A BATCH
  // =====================================================

  async getAllAuditsByBatchId(batchId: string) {
    const [lotAudits, packetsAudits, bagsAudits, finishedGoodsAudits] = await Promise.all([
      this.getLotInventoryAuditByBatchId(batchId),
      this.getPacketsInventoryAuditByBatchId(batchId),
      this.getBagsInventoryAuditByBatchId(batchId),
      this.getFinishedGoodsInventoryAuditByBatchId(batchId)
    ]);

    return {
      lot_inventory_audit: lotAudits,
      packets_inventory_audit: packetsAudits,
      bags_inventory_audit: bagsAudits,
      finished_goods_inventory_audit: finishedGoodsAudits,
      summary: {
        lot_operations: lotAudits.length,
        packets_operations: packetsAudits.length,
        bags_operations: bagsAudits.length,
        finished_goods_operations: finishedGoodsAudits.length,
        total_operations: lotAudits.length + packetsAudits.length + bagsAudits.length + finishedGoodsAudits.length
      }
    };
  }
}

export const inventoryAuditService = new InventoryAuditService();

