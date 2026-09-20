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

type Pagination = { limit: number; offset: number };

export class InventoryAuditService {
  // =====================================================
  // LOT INVENTORY AUDIT
  // =====================================================

  async getLotInventoryAuditByLotId(
    lotId: string,
    pagination?: Pagination
  ): Promise<{ items: LotInventoryAuditResponse[]; total: number }> {
    const { rows, total } = await lotInventoryAuditDAO.findByLotId(lotId, pagination);
    return { items: this.formatLotAuditResponse(rows), total };
  }

  async getLotInventoryAuditByLotInventoryId(
    lotInventoryId: string,
    pagination?: Pagination
  ): Promise<{ items: LotInventoryAuditResponse[]; total: number }> {
    const { rows, total } = await lotInventoryAuditDAO.findByLotInventoryId(lotInventoryId, pagination);
    return { items: this.formatLotAuditResponse(rows), total };
  }

  async getLotInventoryAuditByBatchId(
    batchId: string,
    pagination?: Pagination
  ): Promise<{ items: LotInventoryAuditResponse[]; total: number }> {
    const { rows, total } = await lotInventoryAuditDAO.findByBatchId(batchId, pagination);
    return { items: this.formatLotAuditResponse(rows), total };
  }

  async getRecentLotInventoryAudit(
    pagination?: Pagination
  ): Promise<{ items: LotInventoryAuditResponse[]; total: number }> {
    const { rows, total } = await lotInventoryAuditDAO.findRecent(pagination);
    return { items: this.formatLotAuditResponse(rows), total };
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

  async getPacketsInventoryAuditByPackagingId(
    packagingId: string,
    pagination?: Pagination
  ): Promise<{ items: PacketsInventoryAuditResponse[]; total: number }> {
    const { rows, total } = await packetsInventoryAuditDAO.findByPackagingId(packagingId, pagination);
    return { items: this.formatPacketsAuditResponse(rows), total };
  }

  async getPacketsInventoryAuditByPacketsInventoryId(
    packetsInventoryId: string,
    pagination?: Pagination
  ): Promise<{ items: PacketsInventoryAuditResponse[]; total: number }> {
    const { rows, total } = await packetsInventoryAuditDAO.findByPacketsInventoryId(
      packetsInventoryId,
      pagination
    );
    return { items: this.formatPacketsAuditResponse(rows), total };
  }

  async getPacketsInventoryAuditByBatchId(
    batchId: string,
    pagination?: Pagination
  ): Promise<{ items: PacketsInventoryAuditResponse[]; total: number }> {
    const { rows, total } = await packetsInventoryAuditDAO.findByBatchId(batchId, pagination);
    return { items: this.formatPacketsAuditResponse(rows), total };
  }

  async getRecentPacketsInventoryAudit(
    pagination?: Pagination
  ): Promise<{ items: PacketsInventoryAuditResponse[]; total: number }> {
    const { rows, total } = await packetsInventoryAuditDAO.findRecent(pagination);
    return { items: this.formatPacketsAuditResponse(rows), total };
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

  async getBagsInventoryAuditByBagsInventoryId(
    bagsInventoryId: string,
    pagination?: Pagination
  ): Promise<{ items: BagsInventoryAuditResponse[]; total: number }> {
    const { rows, total } = await bagsInventoryAuditDAO.findByBagsInventoryId(bagsInventoryId, pagination);
    return { items: this.formatBagsAuditResponse(rows), total };
  }

  async getBagsInventoryAuditByBagTypeAndCapacity(
    bagType: string,
    bagCapacity: number,
    pagination?: Pagination
  ): Promise<{ items: BagsInventoryAuditResponse[]; total: number }> {
    const { rows, total } = await bagsInventoryAuditDAO.findByBagTypeAndCapacity(
      bagType,
      bagCapacity,
      pagination
    );
    return { items: this.formatBagsAuditResponse(rows), total };
  }

  async getBagsInventoryAuditByBatchId(
    batchId: string,
    pagination?: Pagination
  ): Promise<{ items: BagsInventoryAuditResponse[]; total: number }> {
    const { rows, total } = await bagsInventoryAuditDAO.findByBatchId(batchId, pagination);
    return { items: this.formatBagsAuditResponse(rows), total };
  }

  async getBagsInventoryAuditByKaantaId(
    kaantaId: string,
    pagination?: Pagination
  ): Promise<{ items: BagsInventoryAuditResponse[]; total: number }> {
    const { rows, total } = await bagsInventoryAuditDAO.findByKaantaId(kaantaId, pagination);
    return { items: this.formatBagsAuditResponse(rows), total };
  }

  async getRecentBagsInventoryAudit(
    pagination?: Pagination
  ): Promise<{ items: BagsInventoryAuditResponse[]; total: number }> {
    const { rows, total } = await bagsInventoryAuditDAO.findRecent(pagination);
    return { items: this.formatBagsAuditResponse(rows), total };
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

  async getFinishedGoodsInventoryAuditByProductId(
    productId: string,
    pagination?: Pagination
  ): Promise<{ items: FinishedGoodsInventoryAuditResponse[]; total: number }> {
    const { rows, total } = await finishedGoodsInventoryAuditDAO.findByProductId(productId, pagination);
    return { items: this.formatFinishedGoodsAuditResponse(rows), total };
  }

  async getFinishedGoodsInventoryAuditByBatchId(
    batchId: string,
    pagination?: Pagination
  ): Promise<{ items: FinishedGoodsInventoryAuditResponse[]; total: number }> {
    const { rows, total } = await finishedGoodsInventoryAuditDAO.findByBatchId(batchId, pagination);
    return { items: this.formatFinishedGoodsAuditResponse(rows), total };
  }

  async getFinishedGoodsInventoryAuditByFGInventoryId(
    fgInventoryId: string,
    pagination?: Pagination
  ): Promise<{ items: FinishedGoodsInventoryAuditResponse[]; total: number }> {
    const { rows, total } = await finishedGoodsInventoryAuditDAO.findByFinishedGoodsInventoryId(
      fgInventoryId,
      pagination
    );
    return { items: this.formatFinishedGoodsAuditResponse(rows), total };
  }

  async getRecentFinishedGoodsInventoryAudit(
    pagination?: Pagination
  ): Promise<{ items: FinishedGoodsInventoryAuditResponse[]; total: number }> {
    const { rows, total } = await finishedGoodsInventoryAuditDAO.findRecent(pagination);
    return { items: this.formatFinishedGoodsAuditResponse(rows), total };
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

  async getAllAuditsByBatchId(batchId: string, pagination?: Pagination) {
    const [lotAudits, packetsAudits, bagsAudits, finishedGoodsAudits] = await Promise.all([
      this.getLotInventoryAuditByBatchId(batchId, pagination),
      this.getPacketsInventoryAuditByBatchId(batchId, pagination),
      this.getBagsInventoryAuditByBatchId(batchId, pagination),
      this.getFinishedGoodsInventoryAuditByBatchId(batchId, pagination)
    ]);

    return {
      lot_inventory_audit: lotAudits.items,
      packets_inventory_audit: packetsAudits.items,
      bags_inventory_audit: bagsAudits.items,
      finished_goods_inventory_audit: finishedGoodsAudits.items,
      summary: {
        lot_operations: lotAudits.total,
        packets_operations: packetsAudits.total,
        bags_operations: bagsAudits.total,
        finished_goods_operations: finishedGoodsAudits.total,
        total_operations:
          lotAudits.total +
          packetsAudits.total +
          bagsAudits.total +
          finishedGoodsAudits.total,
      },
    };
  }
}

export const inventoryAuditService = new InventoryAuditService();
