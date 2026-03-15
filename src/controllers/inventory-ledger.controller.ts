import { Response, NextFunction } from 'express';
import { inventoryLedgerDAO } from '../dao/inventory-ledger.dao';
import { ResponseHandler } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';
import type { InventoryLedgerSourceType } from '../models/inventory-ledger.model';

export class InventoryLedgerController {
  async get(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const productId = req.query.product_id as string | undefined;
      const sourceType = req.query.source_type as InventoryLedgerSourceType | undefined;
      const fromDate = req.query.from_date as string | undefined;
      const toDate = req.query.to_date as string | undefined;
      const limit = req.query.limit != null ? parseInt(String(req.query.limit), 10) : 100;
      const offset = req.query.offset != null ? parseInt(String(req.query.offset), 10) : 0;

      const entries = await inventoryLedgerDAO.find({
        product_id: productId,
        source_type: sourceType,
        from_date: fromDate,
        to_date: toDate,
        limit: Math.min(limit, 500),
        offset,
      });

      const data = entries.map((e) => ({
        id: e.id,
        product_id: e.product_id,
        quantity_change: parseFloat(e.quantity_change.toString()),
        source_type: e.source_type,
        source_id: e.source_id,
        stock_before: parseFloat(e.stock_before.toString()),
        stock_after: parseFloat(e.stock_after.toString()),
        reference_type: e.reference_type,
        reference_id: e.reference_id,
        batch_id: e.batch_id,
        packaging_id: e.packaging_id,
        created_at: e.created_at instanceof Date ? e.created_at.toISOString() : e.created_at,
        created_by: e.created_by,
      }));

      return ResponseHandler.success(res, data);
    } catch (error) {
      next(error);
    }
  }
}

export const inventoryLedgerController = new InventoryLedgerController();
