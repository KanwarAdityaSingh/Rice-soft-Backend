import { Response, NextFunction } from 'express';
import { batchService } from '../services/batch.service';
import { batchDAO } from '../dao/batch.dao';
import { inventoryAuditService } from '../services/inventory-audit.service';
import { ResponseHandler } from '../utils/response';
import { validate, uuidSchema } from '../utils/validators';
import { AuthRequest } from '../middleware/auth.middleware';
import { CreateBatchDTO, UpdateBatchDTO, BatchResponse, BatchWithDetailsResponse } from '../models/batch.model';
import { createBatchSchema, updateBatchSchema } from '../utils/validators';

export class BatchController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const productId = req.query.product_id as string | undefined;
      const status = req.query.status as string | undefined;

      const batches = await batchDAO.findAll(productId, status);

      const batchResponses: BatchResponse[] = batches.map((batch) => ({
        id: batch.id,
        batch_number: batch.batch_number,
        product_id: batch.product_id,
        recipe_id: batch.recipe_id,
        packaging_id: batch.packaging_id,
        quantity: parseFloat(batch.quantity.toString()),
        status: batch.status,
        created_at: batch.created_at.toISOString(),
        updated_at: batch.updated_at.toISOString(),
      }));

      return ResponseHandler.success(res, batchResponses);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      const batchDetails = await batchService.getBatchWithDetails(id);

      const batchResponse: BatchWithDetailsResponse = {
        id: batchDetails.id,
        batch_number: batchDetails.batch_number,
        product_id: batchDetails.product_id,
        recipe_id: batchDetails.recipe_id,
        packaging_id: batchDetails.packaging_id,
        quantity: parseFloat(batchDetails.quantity.toString()),
        status: batchDetails.status,
        created_at: batchDetails.created_at.toISOString(),
        updated_at: batchDetails.updated_at.toISOString(),
        product: batchDetails.product,
        recipe: batchDetails.recipe,
        packaging: batchDetails.packaging,
        lot_usage: batchDetails.lot_usage?.map((usage: any) => ({
          id: usage.id,
          batch_id: usage.batch_id,
          lot_id: usage.lot_id,
          quantity_used: parseFloat(usage.quantity_used.toString()),
          percentage_used: parseFloat(usage.percentage_used.toString()),
          created_at: usage.created_at instanceof Date ? usage.created_at.toISOString() : usage.created_at,
          updated_at: usage.updated_at instanceof Date ? usage.updated_at.toISOString() : usage.updated_at,
        })),
        rice_code_usage: batchDetails.rice_code_usage?.map((usage: any) => ({
          id: usage.id,
          batch_id: usage.batch_id,
          rice_code_id: usage.rice_code_id,
          rice_type: usage.rice_type,
          total_quantity_used: parseFloat(usage.total_quantity_used.toString()),
          created_at: usage.created_at instanceof Date ? usage.created_at.toISOString() : usage.created_at,
          updated_at: usage.updated_at instanceof Date ? usage.updated_at.toISOString() : usage.updated_at,
        })),
      };

      return ResponseHandler.success(res, batchResponse);
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const batchData = validate<CreateBatchDTO>(createBatchSchema, req.body);

      // Set created_by from authenticated user
      if (req.user) {
        batchData.created_by = req.user.userId;
      }

      const batch = await batchService.createBatch(batchData);

      const batchResponse: BatchResponse = {
        id: batch.id,
        batch_number: batch.batch_number,
        product_id: batch.product_id,
        recipe_id: batch.recipe_id,
        packaging_id: batch.packaging_id,
        quantity: parseFloat(batch.quantity.toString()),
        status: batch.status,
        created_at: batch.created_at.toISOString(),
        updated_at: batch.updated_at.toISOString(),
      };

      return ResponseHandler.created(res, batchResponse, 'Batch created successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const batchData = validate<UpdateBatchDTO>(updateBatchSchema, req.body);

      // Set updated_by from authenticated user
      if (req.user) {
        batchData.updated_by = req.user.userId;
      }

      const batch = await batchDAO.update(id, batchData);
      if (!batch) {
        return ResponseHandler.error(res, 'Batch not found', 404);
      }

      const batchResponse: BatchResponse = {
        id: batch.id,
        batch_number: batch.batch_number,
        product_id: batch.product_id,
        recipe_id: batch.recipe_id,
        packaging_id: batch.packaging_id,
        quantity: parseFloat(batch.quantity.toString()),
        status: batch.status,
        created_at: batch.created_at.toISOString(),
        updated_at: batch.updated_at.toISOString(),
      };

      return ResponseHandler.success(res, batchResponse, 'Batch updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async getLotUsage(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const batchId = validate<string>(uuidSchema, req.params.id);

      const lotUsage = await batchDAO.getLotUsage(batchId);

      return ResponseHandler.success(res, lotUsage.map((usage: any) => ({
        id: usage.id,
        batch_id: usage.batch_id,
        lot_id: usage.lot_id,
        quantity_used: parseFloat(usage.quantity_used.toString()),
        percentage_used: parseFloat(usage.percentage_used.toString()),
        created_at: usage.created_at instanceof Date ? usage.created_at.toISOString() : usage.created_at,
        updated_at: usage.updated_at instanceof Date ? usage.updated_at.toISOString() : usage.updated_at,
      })));
    } catch (error) {
      next(error);
    }
  }

  async getRiceCodeUsage(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const batchId = validate<string>(uuidSchema, req.params.id);

      const riceCodeUsage = await batchDAO.getRiceCodeUsage(batchId);

      return ResponseHandler.success(res, riceCodeUsage.map((usage: any) => ({
        id: usage.id,
        batch_id: usage.batch_id,
        rice_code_id: usage.rice_code_id,
        rice_type: usage.rice_type,
        total_quantity_used: parseFloat(usage.total_quantity_used.toString()),
        created_at: usage.created_at instanceof Date ? usage.created_at.toISOString() : usage.created_at,
        updated_at: usage.updated_at instanceof Date ? usage.updated_at.toISOString() : usage.updated_at,
      })));
    } catch (error) {
      next(error);
    }
  }

  async getInventoryAudit(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const batchId = validate<string>(uuidSchema, req.params.id);

      const audits = await inventoryAuditService.getAllAuditsByBatchId(batchId);

      return ResponseHandler.success(res, audits);
    } catch (error) {
      next(error);
    }
  }
}

