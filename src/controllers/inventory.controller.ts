import { Response, NextFunction } from 'express';
import { inventoryService } from '../services/inventory.service';
import { inventoryAuditService } from '../services/inventory-audit.service';
import { ResponseHandler } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';
import { validate, uuidSchema } from '../utils/validators';
import { BAG_TYPE_VALUES } from '../constants/bag-types';
import { parsePaginationQuery, toPaginatedResult } from '../utils/pagination';

export class InventoryController {
  // =====================================================
  // INVENTORY ENDPOINTS
  // =====================================================

  async getFinishedGoods(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const productId = req.query.product_id as string | undefined;
      const batchId = req.query.batch_id as string | undefined;
      const godownId = req.query.godown_id as string | undefined;

      const inventory = await inventoryService.getFinishedGoodsInventory(productId, batchId, godownId);

      return ResponseHandler.success(res, inventory);
    } catch (error) {
      next(error);
    }
  }

  async getPackets(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const godownId = req.query.godown_id as string | undefined;
      const inventory = await inventoryService.getPacketsInventory(godownId);

      return ResponseHandler.success(res, inventory);
    } catch (error) {
      next(error);
    }
  }

  async getLots(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const godownId = req.query.godown_id as string | undefined;
      const inventory = await inventoryService.getLotInventory(godownId);

      return ResponseHandler.success(res, inventory);
    } catch (error) {
      next(error);
    }
  }

  async getBags(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const bagType = req.query.bag_type as string | undefined;
      const godownId = req.query.godown_id as string | undefined;

      const inventory = await inventoryService.getBagsInventory(bagType, godownId);

      return ResponseHandler.success(res, inventory);
    } catch (error) {
      next(error);
    }
  }

  async getSummary(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const godownId = req.query.godown_id as string | undefined;
      const summary = await inventoryService.getInventorySummary(godownId);

      return ResponseHandler.success(res, summary);
    } catch (error) {
      next(error);
    }
  }

  async getHierarchical(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const godownId = req.query.godown_id as string | undefined;
      const hierarchicalInventory = await inventoryService.getHierarchicalInventory(godownId);

      return ResponseHandler.success(res, hierarchicalInventory);
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
      const { page, limit, offset } = parsePaginationQuery(req.query);
      const { items, total } = await inventoryAuditService.getLotInventoryAuditByLotId(lotId, {
        limit,
        offset,
      });
      return ResponseHandler.success(res, toPaginatedResult(items, total, page, limit));
    } catch (error) {
      next(error);
    }
  }

  async getLotInventoryAuditByLotInventoryId(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const lotInventoryId = validate<string>(uuidSchema, req.params.lotInventoryId);
      const { page, limit, offset } = parsePaginationQuery(req.query);
      const { items, total } = await inventoryAuditService.getLotInventoryAuditByLotInventoryId(
        lotInventoryId,
        { limit, offset }
      );
      return ResponseHandler.success(res, toPaginatedResult(items, total, page, limit));
    } catch (error) {
      next(error);
    }
  }

  async getRecentLotInventoryAudit(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { page, limit, offset } = parsePaginationQuery(req.query);
      const { items, total } = await inventoryAuditService.getRecentLotInventoryAudit({
        limit,
        offset,
      });
      return ResponseHandler.success(res, toPaginatedResult(items, total, page, limit));
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
      const { page, limit, offset } = parsePaginationQuery(req.query);
      const { items, total } = await inventoryAuditService.getPacketsInventoryAuditByPackagingId(
        packagingId,
        { limit, offset }
      );
      return ResponseHandler.success(res, toPaginatedResult(items, total, page, limit));
    } catch (error) {
      next(error);
    }
  }

  async getPacketsInventoryAuditByPacketsInventoryId(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const packetsInventoryId = validate<string>(uuidSchema, req.params.packetsInventoryId);
      const { page, limit, offset } = parsePaginationQuery(req.query);
      const { items, total } =
        await inventoryAuditService.getPacketsInventoryAuditByPacketsInventoryId(packetsInventoryId, {
          limit,
          offset,
        });
      return ResponseHandler.success(res, toPaginatedResult(items, total, page, limit));
    } catch (error) {
      next(error);
    }
  }

  async getRecentPacketsInventoryAudit(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { page, limit, offset } = parsePaginationQuery(req.query);
      const { items, total } = await inventoryAuditService.getRecentPacketsInventoryAudit({
        limit,
        offset,
      });
      return ResponseHandler.success(res, toPaginatedResult(items, total, page, limit));
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
      const { page, limit, offset } = parsePaginationQuery(req.query);
      const { items, total } = await inventoryAuditService.getBagsInventoryAuditByBagsInventoryId(
        bagsInventoryId,
        { limit, offset }
      );
      return ResponseHandler.success(res, toPaginatedResult(items, total, page, limit));
    } catch (error) {
      next(error);
    }
  }

  async getBagsInventoryAuditByBagTypeAndCapacity(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const bagType = req.params.bagType;
      const bagCapacity = parseFloat(req.params.bagCapacity);
      const { page, limit, offset } = parsePaginationQuery(req.query);

      if (!(BAG_TYPE_VALUES as readonly string[]).includes(bagType)) {
        return ResponseHandler.error(res, `Invalid bag type. Must be one of: ${BAG_TYPE_VALUES.join(', ')}`, 400);
      }

      if (isNaN(bagCapacity) || bagCapacity <= 0) {
        return ResponseHandler.error(res, 'Invalid bag capacity', 400);
      }

      const { items, total } = await inventoryAuditService.getBagsInventoryAuditByBagTypeAndCapacity(
        bagType,
        bagCapacity,
        { limit, offset }
      );
      return ResponseHandler.success(res, toPaginatedResult(items, total, page, limit));
    } catch (error) {
      next(error);
    }
  }

  async getBagsInventoryAuditByKaantaId(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const kaantaId = validate<string>(uuidSchema, req.params.kaantaId);
      const { page, limit, offset } = parsePaginationQuery(req.query);
      const { items, total } = await inventoryAuditService.getBagsInventoryAuditByKaantaId(kaantaId, {
        limit,
        offset,
      });
      return ResponseHandler.success(res, toPaginatedResult(items, total, page, limit));
    } catch (error) {
      next(error);
    }
  }

  async getRecentBagsInventoryAudit(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { page, limit, offset } = parsePaginationQuery(req.query);
      const { items, total } = await inventoryAuditService.getRecentBagsInventoryAudit({
        limit,
        offset,
      });
      return ResponseHandler.success(res, toPaginatedResult(items, total, page, limit));
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
      const { page, limit, offset } = parsePaginationQuery(req.query);
      const { items, total } = await inventoryAuditService.getFinishedGoodsInventoryAuditByProductId(
        productId,
        { limit, offset }
      );
      return ResponseHandler.success(res, toPaginatedResult(items, total, page, limit));
    } catch (error) {
      next(error);
    }
  }

  async getFinishedGoodsInventoryAuditByBatchId(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const batchId = validate<string>(uuidSchema, req.params.batchId);
      const { page, limit, offset } = parsePaginationQuery(req.query);
      const { items, total } = await inventoryAuditService.getFinishedGoodsInventoryAuditByBatchId(
        batchId,
        { limit, offset }
      );
      return ResponseHandler.success(res, toPaginatedResult(items, total, page, limit));
    } catch (error) {
      next(error);
    }
  }

  async getFinishedGoodsInventoryAuditByFGInventoryId(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const fgInventoryId = validate<string>(uuidSchema, req.params.fgInventoryId);
      const { page, limit, offset } = parsePaginationQuery(req.query);
      const { items, total } =
        await inventoryAuditService.getFinishedGoodsInventoryAuditByFGInventoryId(fgInventoryId, {
          limit,
          offset,
        });
      return ResponseHandler.success(res, toPaginatedResult(items, total, page, limit));
    } catch (error) {
      next(error);
    }
  }

  async getRecentFinishedGoodsInventoryAudit(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { page, limit, offset } = parsePaginationQuery(req.query);
      const { items, total } = await inventoryAuditService.getRecentFinishedGoodsInventoryAudit({
        limit,
        offset,
      });
      return ResponseHandler.success(res, toPaginatedResult(items, total, page, limit));
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
      const { limit, offset } = parsePaginationQuery(req.query);
      const audits = await inventoryAuditService.getAllAuditsByBatchId(batchId, { limit, offset });
      return ResponseHandler.success(res, audits);
    } catch (error) {
      next(error);
    }
  }
}
