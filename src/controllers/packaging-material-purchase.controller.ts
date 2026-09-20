import { Response, NextFunction } from 'express';
import { packagingMaterialPurchaseService } from '../services/packaging-material-purchase.service';
import { ResponseHandler } from '../utils/response';
import {
  validate,
  uuidSchema,
  createPackagingMaterialPurchaseSchema,
  updatePackagingMaterialPurchaseSchema,
} from '../utils/validators';
import { parsePaginationQuery, toPaginatedResult } from '../utils/pagination';
import { parseSearchQuery } from '../utils/search';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  CreatePackagingMaterialPurchaseDTO,
  UpdatePackagingMaterialPurchaseDTO,
} from '../models/packaging-material-purchase.model';
import { uploadToS3, validateFileSize, validateFileType } from '../utils/s3-upload';
import { appConfig } from '../config/app.config';
import { ValidationError, InternalServerError, NotFoundError } from '../utils/errors';
import { packagingMaterialPurchaseDAO } from '../dao/packaging-material-purchase.dao';
import { db } from '../database/connection';

export class PackagingMaterialPurchaseController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const packaging_id = req.query.packaging_id as string | undefined;
      const vendor_id = req.query.vendor_id as string | undefined;
      const search = parseSearchQuery(req.query);
      const { page, limit, offset } = parsePaginationQuery(req.query);
      const { items, total } = await packagingMaterialPurchaseService.list(
        { packaging_id, vendor_id, search },
        { limit, offset }
      );
      return ResponseHandler.success(res, toPaginatedResult(items, total, page, limit));
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      return ResponseHandler.success(res, await packagingMaterialPurchaseService.getById(id));
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const data = validate<CreatePackagingMaterialPurchaseDTO>(
        createPackagingMaterialPurchaseSchema,
        req.body
      );
      if (req.user) data.created_by = req.user.userId;
      return ResponseHandler.created(
        res,
        await packagingMaterialPurchaseService.create(data),
        'Packaging material purchase created successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const data = validate<UpdatePackagingMaterialPurchaseDTO>(
        updatePackagingMaterialPurchaseSchema,
        req.body
      );
      if (req.user) data.updated_by = req.user.userId;
      return ResponseHandler.success(
        res,
        await packagingMaterialPurchaseService.update(id, data),
        'Packaging material purchase updated successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async uploadInvoice(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      if (!req.file) throw new ValidationError('File is required');

      validateFileSize(req.file.size, 10);
      validateFileType(req.file.mimetype, [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'application/pdf',
      ]);

      const existing = await packagingMaterialPurchaseDAO.findById(id);
      if (!existing) throw new NotFoundError('Packaging material purchase not found');

      let uploadResult;
      try {
        uploadResult = await uploadToS3(
          req.file.buffer,
          req.file.originalname,
          appConfig.aws.s3.packagingBillsFolder
        );
      } catch {
        throw new InternalServerError('Failed to upload invoice. Please try again.');
      }

      const result = await db.query(
        `UPDATE packaging_material_purchases
         SET invoice_document_url = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $2
         WHERE id = $3
         RETURNING id`,
        [uploadResult.url, req.user?.userId ?? null, id]
      );
      if (!result.rows[0]) throw new NotFoundError('Packaging material purchase not found');

      const updated = await packagingMaterialPurchaseService.getById(id);
      return ResponseHandler.success(
        res,
        { url: uploadResult.url, purchase: updated },
        'Invoice uploaded successfully'
      );
    } catch (error) {
      next(error);
    }
  }
}
