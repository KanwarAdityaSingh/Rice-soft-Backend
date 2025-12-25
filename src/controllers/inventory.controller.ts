import { Response, NextFunction } from 'express';
import { inventoryService } from '../services/inventory.service';
import { ResponseHandler } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';

export class InventoryController {
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
}

