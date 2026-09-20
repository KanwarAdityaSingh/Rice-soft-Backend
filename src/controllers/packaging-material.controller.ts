import { Response, NextFunction } from 'express';
import { packagingMaterialService } from '../services/packaging-material.service';
import { ResponseHandler } from '../utils/response';
import {
  validate,
  uuidSchema,
  createPackagingMaterialSchema,
  updatePackagingMaterialSchema,
} from '../utils/validators';
import { parsePaginationQuery, toPaginatedResult } from '../utils/pagination';
import { parseSearchQuery } from '../utils/search';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  CreatePackagingMaterialDTO,
  UpdatePackagingMaterialDTO,
} from '../models/packaging-material.model';

export class PackagingMaterialController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const activeOnly = req.query.status === 'active' || req.query.active === 'true';
      const search = parseSearchQuery(req.query);
      const { page, limit, offset } = parsePaginationQuery(req.query);
      const { items, total } = await packagingMaterialService.list(activeOnly, { limit, offset }, search);
      return ResponseHandler.success(res, toPaginatedResult(items, total, page, limit));
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      return ResponseHandler.success(res, await packagingMaterialService.getById(id));
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const data = validate<CreatePackagingMaterialDTO>(createPackagingMaterialSchema, req.body);
      if (req.user) data.created_by = req.user.userId;
      return ResponseHandler.created(
        res,
        await packagingMaterialService.create(data),
        'Packaging material created successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const data = validate<UpdatePackagingMaterialDTO>(updatePackagingMaterialSchema, req.body);
      if (req.user) data.updated_by = req.user.userId;
      return ResponseHandler.success(
        res,
        await packagingMaterialService.update(id, data),
        'Packaging material updated successfully'
      );
    } catch (error) {
      next(error);
    }
  }
}
