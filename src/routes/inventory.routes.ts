import { Router } from 'express';
import { InventoryController } from '../controllers/inventory.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const inventoryController = new InventoryController();

// Apply authentication middleware to all routes
router.use(authenticate);

// =====================================================
// INVENTORY ENDPOINTS
// =====================================================
router.get('/finished-goods', inventoryController.getFinishedGoods.bind(inventoryController));
router.get('/packets', inventoryController.getPackets.bind(inventoryController));
router.get('/lots', inventoryController.getLots.bind(inventoryController));
router.get('/bags', inventoryController.getBags.bind(inventoryController));
router.get('/summary', inventoryController.getSummary.bind(inventoryController));
router.get('/hierarchical', inventoryController.getHierarchical.bind(inventoryController));

// =====================================================
// AUDIT ENDPOINTS - LOT INVENTORY
// =====================================================
// GET /api/v1/inventory/audit/lots/recent - Get recent lot inventory audit logs
router.get('/audit/lots/recent', inventoryController.getRecentLotInventoryAudit.bind(inventoryController));
// GET /api/v1/inventory/audit/lots/lot/:lotId - Get audit logs by lot ID
router.get('/audit/lots/lot/:lotId', inventoryController.getLotInventoryAuditByLotId.bind(inventoryController));
// GET /api/v1/inventory/audit/lots/:lotInventoryId - Get audit logs by lot inventory ID
router.get('/audit/lots/:lotInventoryId', inventoryController.getLotInventoryAuditByLotInventoryId.bind(inventoryController));

// =====================================================
// AUDIT ENDPOINTS - PACKETS INVENTORY
// =====================================================
// GET /api/v1/inventory/audit/packets/recent - Get recent packets inventory audit logs
router.get('/audit/packets/recent', inventoryController.getRecentPacketsInventoryAudit.bind(inventoryController));
// GET /api/v1/inventory/audit/packets/packaging/:packagingId - Get audit logs by packaging ID
router.get('/audit/packets/packaging/:packagingId', inventoryController.getPacketsInventoryAuditByPackagingId.bind(inventoryController));
// GET /api/v1/inventory/audit/packets/:packetsInventoryId - Get audit logs by packets inventory ID
router.get('/audit/packets/:packetsInventoryId', inventoryController.getPacketsInventoryAuditByPacketsInventoryId.bind(inventoryController));

// =====================================================
// AUDIT ENDPOINTS - BAGS INVENTORY
// =====================================================
// GET /api/v1/inventory/audit/bags/recent - Get recent bags inventory audit logs
router.get('/audit/bags/recent', inventoryController.getRecentBagsInventoryAudit.bind(inventoryController));
// GET /api/v1/inventory/audit/bags/type/:bagType/capacity/:bagCapacity - Get audit logs by bag type and capacity
router.get('/audit/bags/type/:bagType/capacity/:bagCapacity', inventoryController.getBagsInventoryAuditByBagTypeAndCapacity.bind(inventoryController));
// GET /api/v1/inventory/audit/bags/kaanta/:kaantaId - Get audit logs by kaanta ID
router.get('/audit/bags/kaanta/:kaantaId', inventoryController.getBagsInventoryAuditByKaantaId.bind(inventoryController));
// GET /api/v1/inventory/audit/bags/:bagsInventoryId - Get audit logs by bags inventory ID
router.get('/audit/bags/:bagsInventoryId', inventoryController.getBagsInventoryAuditByBagsInventoryId.bind(inventoryController));

// =====================================================
// AUDIT ENDPOINTS - FINISHED GOODS INVENTORY
// =====================================================
// GET /api/v1/inventory/audit/finished-goods/recent - Get recent finished goods inventory audit logs
router.get('/audit/finished-goods/recent', inventoryController.getRecentFinishedGoodsInventoryAudit.bind(inventoryController));
// GET /api/v1/inventory/audit/finished-goods/product/:productId - Get audit logs by product ID
router.get('/audit/finished-goods/product/:productId', inventoryController.getFinishedGoodsInventoryAuditByProductId.bind(inventoryController));
// GET /api/v1/inventory/audit/finished-goods/batch/:batchId - Get audit logs by batch ID
router.get('/audit/finished-goods/batch/:batchId', inventoryController.getFinishedGoodsInventoryAuditByBatchId.bind(inventoryController));
// GET /api/v1/inventory/audit/finished-goods/:fgInventoryId - Get audit logs by finished goods inventory ID
router.get('/audit/finished-goods/:fgInventoryId', inventoryController.getFinishedGoodsInventoryAuditByFGInventoryId.bind(inventoryController));

// =====================================================
// COMBINED AUDIT FOR BATCH
// =====================================================
// GET /api/v1/inventory/audit/batch/:batchId - Get all inventory audit logs for a batch
router.get('/audit/batch/:batchId', inventoryController.getAllAuditsByBatchId.bind(inventoryController));

export default router;
