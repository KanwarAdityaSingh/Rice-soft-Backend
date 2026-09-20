import { Response, NextFunction } from 'express';
import { riceLengthService, toRiceLengthResponse } from '../services/rice-length.service';
import { ResponseHandler } from '../utils/response';
import {
  validate,
  uuidSchema,
  createRiceLengthSchema,
  updateRiceLengthSchema,
} from '../utils/validators';
import { AuthRequest } from '../middleware/auth.middleware';
import { CreateRiceLengthDTO, UpdateRiceLengthDTO } from '../models/rice-length.model';
import { parsePaginationQuery, toPaginatedResult } from '../utils/pagination';

export class RiceLengthController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const includeInactive = req.query.include_inactive === 'true';
      const { page, limit, offset } = parsePaginationQuery(req.query);
      const { items, total } = await riceLengthService.getAll(includeInactive, { limit, offset });
      return ResponseHandler.success(
        res,
        toPaginatedResult(items.map(toRiceLengthResponse), total, page, limit)
      );
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const row = await riceLengthService.getById(id);
      return ResponseHandler.success(res, toRiceLengthResponse(row));
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const data = validate<CreateRiceLengthDTO>(createRiceLengthSchema, req.body);
      if (req.user) {
        data.created_by = req.user.userId;
      }
      const row = await riceLengthService.create(data);
      return ResponseHandler.created(res, toRiceLengthResponse(row), 'Rice length created successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const data = validate<UpdateRiceLengthDTO>(updateRiceLengthSchema, req.body);
      if (req.user) {
        data.updated_by = req.user.userId;
      }
      const row = await riceLengthService.update(id, data);
      return ResponseHandler.success(res, toRiceLengthResponse(row), 'Rice length updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      await riceLengthService.delete(id);
      return ResponseHandler.success(res, null, 'Rice length deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const riceLengthController = new RiceLengthController();
