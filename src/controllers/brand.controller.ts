import { Response, NextFunction } from 'express';
import { brandService } from '../services/brand.service';
import { ResponseHandler } from '../utils/response';
import { validate, uuidSchema, createBrandSchema, updateBrandSchema } from '../utils/validators';
import { parsePaginationQuery, toPaginatedResult } from '../utils/pagination';
import { parseSearchQuery } from '../utils/search';
import { AuthRequest } from '../middleware/auth.middleware';
import { CreateBrandDTO, UpdateBrandDTO } from '../models/brand.model';

export class BrandController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const activeOnly = req.query.status === 'active' || req.query.active === 'true';
      const { page, limit, offset } = parsePaginationQuery(req.query);
      const search = parseSearchQuery(req.query);
      const { items, total } = await brandService.list(activeOnly, { limit, offset }, search);
      return ResponseHandler.success(res, toPaginatedResult(items, total, page, limit));
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      return ResponseHandler.success(res, await brandService.getById(id));
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const data = validate<CreateBrandDTO>(createBrandSchema, req.body);
      if (req.user) data.created_by = req.user.userId;
      return ResponseHandler.created(res, await brandService.create(data), 'Brand created successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const data = validate<UpdateBrandDTO>(updateBrandSchema, req.body);
      if (req.user) data.updated_by = req.user.userId;
      return ResponseHandler.success(res, await brandService.update(id, data), 'Brand updated successfully');
    } catch (error) {
      next(error);
    }
  }
}
