import { Response, NextFunction } from 'express';
import { inventoryService } from '../services/inventory.service';
import { inventoryAuditService } from '../services/inventory-audit.service';
import { ResponseHandler } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';
import { validate, uuidSchema } from '../utils/validators';

export class InventoryController {
  // =====================================================
  // INVENTORY ENDPOINTS
  // =====================================================

  async getFinishedGoods(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const productId = req.query.product_id as string | undefined;
      const batchId = req.query.batch_id as string | undefined;

      const inventory = await inventoryService.getFinishedGoodsInventory(productId, batchId);

      return ResponseHandler.success(res, inventory);
    } catch (error) {
      next(error);
    }
  }

  async getPackets(_req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const inventory = await inventoryService.getPacketsInventory();

      return ResponseHandler.success(res, inventory);
    } catch (error) {
      next(error);
    }
  }

  async getLots(_req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const inventory = await inventoryService.getLotInventory();

      return ResponseHandler.success(res, inventory);
    } catch (error) {
      next(error);
    }
  }

  async getBags(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const bagType = req.query.bag_type as string | undefined;

      const inventory = await inventoryService.getBagsInventory(bagType);

      return ResponseHandler.success(res, inventory);
    } catch (error) {
      next(error);
    }
  }

  async getSummary(_req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const summary = await inventoryService.getInventorySummary();

      return ResponseHandler.success(res, summary);
    } catch (error) {
      next(error);
    }
  }

  // =====================================================
  // LOT INVENTORY AUDIT ENDPOINTS
  // =====================================================

  async getLotInventoryAuditByLotId(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const lotId = validate<string>(uuidSchema, req.params.lotId);
      const limit = parseInt(req.query.limit as string) || 100;

      const audits = await inventoryAuditService.getLotInventoryAuditByLotId(lotId, limit);

      return ResponseHandler.success(res, audits);
    } catch (error) {
      next(error);
    }
  }

  async getLotInventoryAuditByLotInventoryId(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const lotInventoryId = validate<string>(uuidSchema, req.params.lotInventoryId);
      const limit = parseInt(req.query.limit as string) || 100;

      const audits = await inventoryAuditService.getLotInventoryAuditByLotInventoryId(lotInventoryId, limit);

      return ResponseHandler.success(res, audits);
    } catch (error) {
      next(error);
    }
  }

  async getRecentLotInventoryAudit(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const limit = parseInt(req.query.limit as string) || 100;

      const audits = await inventoryAuditService.getRecentLotInventoryAudit(limit);

      return ResponseHandler.success(res, audits);
    } catch (error) {
      next(error);
    }
  }

  // =====================================================
  // PACKETS INVENTORY AUDIT ENDPOINTS
  // =====================================================

  async getPacketsInventoryAuditByPackagingId(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const packagingId = validate<string>(uuidSchema, req.params.packagingId);
      const limit = parseInt(req.query.limit as string) || 100;

      const audits = await inventoryAuditService.getPacketsInventoryAuditByPackagingId(packagingId, limit);

      return ResponseHandler.success(res, audits);
    } catch (error) {
      next(error);
    }
  }

  async getPacketsInventoryAuditByPacketsInventoryId(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const packetsInventoryId = validate<string>(uuidSchema, req.params.packetsInventoryId);
      const limit = parseInt(req.query.limit as string) || 100;

      const audits = await inventoryAuditService.getPacketsInventoryAuditByPacketsInventoryId(packetsInventoryId, limit);

      return ResponseHandler.success(res, audits);
    } catch (error) {
      next(error);
    }
  }

  async getRecentPacketsInventoryAudit(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const limit = parseInt(req.query.limit as string) || 100;

      const audits = await inventoryAuditService.getRecentPacketsInventoryAudit(limit);

      return ResponseHandler.success(res, audits);
    } catch (error) {
      next(error);
    }
  }

  // =====================================================
  // BAGS INVENTORY AUDIT ENDPOINTS
  // =====================================================

  async getBagsInventoryAuditByBagsInventoryId(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const bagsInventoryId = validate<string>(uuidSchema, req.params.bagsInventoryId);
      const limit = parseInt(req.query.limit as string) || 100;

      const audits = await inventoryAuditService.getBagsInventoryAuditByBagsInventoryId(bagsInventoryId, limit);

      return ResponseHandler.success(res, audits);
    } catch (error) {
      next(error);
    }
  }

  async getBagsInventoryAuditByBagTypeAndCapacity(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const bagType = req.params.bagType;
      const bagCapacity = parseFloat(req.params.bagCapacity);
      const limit = parseInt(req.query.limit as string) || 100;

      if (!['jute', 'pp'].includes(bagType)) {
        return ResponseHandler.error(res, 'Invalid bag type. Must be "jute" or "pp"', 400);
      }

      if (isNaN(bagCapacity) || bagCapacity <= 0) {
        return ResponseHandler.error(res, 'Invalid bag capacity', 400);
      }

      const audits = await inventoryAuditService.getBagsInventoryAuditByBagTypeAndCapacity(bagType, bagCapacity, limit);

      return ResponseHandler.success(res, audits);
    } catch (error) {
      next(error);
    }
  }

  async getBagsInventoryAuditByKaantaId(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const kaantaId = validate<string>(uuidSchema, req.params.kaantaId);

      const audits = await inventoryAuditService.getBagsInventoryAuditByKaantaId(kaantaId);

      return ResponseHandler.success(res, audits);
    } catch (error) {
      next(error);
    }
  }

  async getRecentBagsInventoryAudit(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const limit = parseInt(req.query.limit as string) || 100;

      const audits = await inventoryAuditService.getRecentBagsInventoryAudit(limit);

      return ResponseHandler.success(res, audits);
    } catch (error) {
      next(error);
    }
  }

  // =====================================================
  // FINISHED GOODS INVENTORY AUDIT ENDPOINTS
  // =====================================================

  async getFinishedGoodsInventoryAuditByProductId(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const productId = validate<string>(uuidSchema, req.params.productId);
      const limit = parseInt(req.query.limit as string) || 100;

      const audits = await inventoryAuditService.getFinishedGoodsInventoryAuditByProductId(productId, limit);

      return ResponseHandler.success(res, audits);
    } catch (error) {
      next(error);
    }
  }

  async getFinishedGoodsInventoryAuditByBatchId(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const batchId = validate<string>(uuidSchema, req.params.batchId);

      const audits = await inventoryAuditService.getFinishedGoodsInventoryAuditByBatchId(batchId);

      return ResponseHandler.success(res, audits);
    } catch (error) {
      next(error);
    }
  }

  async getFinishedGoodsInventoryAuditByFGInventoryId(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const fgInventoryId = validate<string>(uuidSchema, req.params.fgInventoryId);
      const limit = parseInt(req.query.limit as string) || 100;

      const audits = await inventoryAuditService.getFinishedGoodsInventoryAuditByFGInventoryId(fgInventoryId, limit);

      return ResponseHandler.success(res, audits);
    } catch (error) {
      next(error);
    }
  }

  async getRecentFinishedGoodsInventoryAudit(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const limit = parseInt(req.query.limit as string) || 100;

      const audits = await inventoryAuditService.getRecentFinishedGoodsInventoryAudit(limit);

      return ResponseHandler.success(res, audits);
    } catch (error) {
      next(error);
    }
  }

  // =====================================================
  // COMBINED AUDIT FOR BATCH
  // =====================================================

  async getAllAuditsByBatchId(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const batchId = validate<string>(uuidSchema, req.params.batchId);

      const audits = await inventoryAuditService.getAllAuditsByBatchId(batchId);

      return ResponseHandler.success(res, audits);
    } catch (error) {
      next(error);
    }
  }
}
