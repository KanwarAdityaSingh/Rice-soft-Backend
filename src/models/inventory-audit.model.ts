import { BagType } from './kaanta.model';

// Common types for inventory operations
export type InventoryOperationType = 'addition' | 'reduction' | 'adjustment';
export type BagsFieldChanged = 'filled_bags' | 'empty_bags';

// Reference types for audit trail
export type InventoryReferenceType = 
  | 'inward_slip_lot'    // Lot created from inward slip
  | 'batch'              // Batch production consumed/created inventory
  | 'kaanta'             // Kaanta weighing added bags
  | 'manual_addition'    // Manual stock addition
  | 'manual_adjustment'  // Manual stock adjustment
  | 'sale'               // Future: goods sold
  | 'dispatch'           // Future: goods dispatched
  | 'return'             // Future: goods returned
  | 'damage';            // Future: damaged goods removed

// =====================================================
// LOT INVENTORY AUDIT
// =====================================================

export interface LotInventoryAudit {
  id: string;
  lot_inventory_id: string | null;
  lot_id: string;
  operation_type: InventoryOperationType;
  quantity_change: number;
  quantity_before: number;
  quantity_after: number;
  reason: string;
  reference_type: string | null;
  reference_id: string | null;
  batch_id: string | null;
  batch_number: string | null;
  notes: string | null;
  created_at: Date;
  created_by: string | null;
}

export interface CreateLotInventoryAuditDTO {
  lot_inventory_id?: string;
  lot_id: string;
  operation_type: InventoryOperationType;
  quantity_change: number;
  quantity_before: number;
  quantity_after: number;
  reason: string;
  reference_type?: string;
  reference_id?: string;
  batch_id?: string;
  batch_number?: string;
  notes?: string;
  created_by?: string;
}

export interface LotInventoryAuditResponse {
  id: string;
  lot_inventory_id: string | null;
  lot_id: string;
  operation_type: InventoryOperationType;
  quantity_change: number;
  quantity_before: number;
  quantity_after: number;
  reason: string;
  reference_type: string | null;
  reference_id: string | null;
  batch_id: string | null;
  batch_number: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  // Joined data
  lot?: {
    id: string;
    lot_number: string;
    rice_code_id: string | null;
    rice_type: string | null;
  };
  user?: {
    id: string;
    name: string;
  };
}

// =====================================================
// PACKETS INVENTORY AUDIT
// =====================================================

export interface PacketsInventoryAudit {
  id: string;
  packets_inventory_id: string | null;
  packaging_id: string;
  operation_type: InventoryOperationType;
  quantity_change: number;
  quantity_before: number;
  quantity_after: number;
  reason: string;
  reference_type: string | null;
  reference_id: string | null;
  batch_id: string | null;
  batch_number: string | null;
  notes: string | null;
  created_at: Date;
  created_by: string | null;
}

export interface CreatePacketsInventoryAuditDTO {
  packets_inventory_id?: string;
  packaging_id: string;
  operation_type: InventoryOperationType;
  quantity_change: number;
  quantity_before: number;
  quantity_after: number;
  reason: string;
  reference_type?: string;
  reference_id?: string;
  batch_id?: string;
  batch_number?: string;
  notes?: string;
  created_by?: string;
}

export interface PacketsInventoryAuditResponse {
  id: string;
  packets_inventory_id: string | null;
  packaging_id: string;
  operation_type: InventoryOperationType;
  quantity_change: number;
  quantity_before: number;
  quantity_after: number;
  reason: string;
  reference_type: string | null;
  reference_id: string | null;
  batch_id: string | null;
  batch_number: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  // Joined data
  packaging?: {
    id: string;
    holding_capacity: number;
    packet_type: string;
  };
  user?: {
    id: string;
    name: string;
  };
}

// =====================================================
// BAGS INVENTORY AUDIT
// =====================================================

export interface BagsInventoryAudit {
  id: string;
  bags_inventory_id: string | null;
  bag_type: BagType;
  bag_capacity: number;
  operation_type: InventoryOperationType;
  field_changed: BagsFieldChanged;
  quantity_change: number;
  quantity_before: number;
  quantity_after: number;
  reason: string;
  reference_type: string | null;
  reference_id: string | null;
  batch_id: string | null;
  batch_number: string | null;
  kaanta_id: string | null;
  notes: string | null;
  created_at: Date;
  created_by: string | null;
}

export interface CreateBagsInventoryAuditDTO {
  bags_inventory_id?: string;
  bag_type: BagType;
  bag_capacity: number;
  operation_type: InventoryOperationType;
  field_changed: BagsFieldChanged;
  quantity_change: number;
  quantity_before: number;
  quantity_after: number;
  reason: string;
  reference_type?: string;
  reference_id?: string;
  batch_id?: string;
  batch_number?: string;
  kaanta_id?: string;
  notes?: string;
  created_by?: string;
}

export interface BagsInventoryAuditResponse {
  id: string;
  bags_inventory_id: string | null;
  bag_type: BagType;
  bag_capacity: number;
  operation_type: InventoryOperationType;
  field_changed: BagsFieldChanged;
  quantity_change: number;
  quantity_before: number;
  quantity_after: number;
  reason: string;
  reference_type: string | null;
  reference_id: string | null;
  batch_id: string | null;
  batch_number: string | null;
  kaanta_id: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  // Joined data from kaanta
  kaanta_number?: string | null;
  kaanta_sauda_id?: string | null;
  kaanta_isp_id?: string | null;
  // Joined data
  user?: {
    id: string;
    name: string;
  };
}

// =====================================================
// FINISHED GOODS INVENTORY AUDIT
// =====================================================

export interface FinishedGoodsInventoryAudit {
  id: string;
  finished_goods_inventory_id: string | null;
  product_id: string;
  batch_id: string | null;
  batch_number: string | null;
  packaging_id: string | null;
  operation_type: InventoryOperationType;
  packets_change: number;
  packets_before: number;
  packets_after: number;
  weight_change: number;
  weight_before: number;
  weight_after: number;
  reason: string;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  created_at: Date;
  created_by: string | null;
}

export interface CreateFinishedGoodsInventoryAuditDTO {
  finished_goods_inventory_id?: string;
  product_id: string;
  batch_id?: string;
  batch_number?: string;
  packaging_id?: string;
  operation_type: InventoryOperationType;
  packets_change: number;
  packets_before: number;
  packets_after: number;
  weight_change: number;
  weight_before: number;
  weight_after: number;
  reason: string;
  reference_type?: string;
  reference_id?: string;
  notes?: string;
  created_by?: string;
}

export interface FinishedGoodsInventoryAuditResponse {
  id: string;
  finished_goods_inventory_id: string | null;
  product_id: string;
  batch_id: string | null;
  batch_number: string | null;
  packaging_id: string | null;
  operation_type: InventoryOperationType;
  packets_change: number;
  packets_before: number;
  packets_after: number;
  weight_change: number;
  weight_before: number;
  weight_after: number;
  reason: string;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  // Joined data
  product?: {
    id: string;
    name: string;
  };
  packaging?: {
    id: string;
    holding_capacity: number;
    packet_type: string;
  };
  user?: {
    id: string;
    name: string;
  };
}

// =====================================================
// AUDIT REASONS (Constants for business logic)
// =====================================================

export const INVENTORY_AUDIT_REASONS = {
  // Lot Inventory Reasons
  LOT: {
    INITIAL_STOCK: 'Lot created from inward slip',
    BATCH_CONSUMPTION: 'Consumed in batch production',
    MANUAL_ADDITION: 'Manual stock addition',
    MANUAL_ADJUSTMENT: 'Manual inventory adjustment',
    STOCK_CORRECTION: 'Stock count correction',
  },
  
  // Packets Inventory Reasons
  PACKETS: {
    STOCK_ADDITION: 'Empty packets added to inventory',
    BATCH_CONSUMPTION: 'Consumed for batch packaging',
    MANUAL_ADDITION: 'Manual packet stock addition',
    MANUAL_ADJUSTMENT: 'Manual packet inventory adjustment',
    STOCK_CORRECTION: 'Packet stock count correction',
  },
  
  // Bags Inventory Reasons
  BAGS: {
    KAANTA_FILLED: 'Filled bags received from kaanta weighing',
    BATCH_EMPTIED: 'Bags emptied during batch production',
    BATCH_EMPTY_ADDED: 'Empty bags from batch production',
    MANUAL_ADDITION: 'Manual bags stock addition',
    MANUAL_ADJUSTMENT: 'Manual bags inventory adjustment',
    STOCK_CORRECTION: 'Bags stock count correction',
  },
  
  // Finished Goods Inventory Reasons
  FINISHED_GOODS: {
    BATCH_PRODUCTION: 'Finished goods created from batch production',
    SALE: 'Goods sold to sales party',
    DISPATCH: 'Goods dispatched',
    RETURN: 'Goods returned from sales party',
    DAMAGE: 'Damaged goods removed from inventory',
    MANUAL_ADJUSTMENT: 'Manual inventory adjustment',
    STOCK_CORRECTION: 'Stock count correction',
  },
} as const;

