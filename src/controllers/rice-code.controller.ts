import { Response, NextFunction } from 'express';
import { riceCodeService, toRiceCodeResponse } from '../services/rice-code.service';
import { ResponseHandler } from '../utils/response';
import { validate, uuidSchema } from '../utils/validators';
import { AuthRequest } from '../middleware/auth.middleware';
import { CreateRiceCodeDTO, UpdateRiceCodeDTO } from '../models/rice-code.model';
import {
  createRiceCodeSchema,
  updateRiceCodeSchema,
} from '../utils/validators';
import {
  RICE_CATEGORY_OPTIONS,
  BASMATI_VARIANT_OPTIONS,
  NON_BASMATI_VARIANT_OPTIONS,
  type RiceCategory,
} from '../constants/rice-categories';
import { ValidationError } from '../utils/errors';

export class RiceCodeController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const categoryRaw = req.query.category as string | undefined;
      let category: RiceCategory | undefined;
      if (categoryRaw === 'basmati' || categoryRaw === 'non_basmati') {
        category = categoryRaw;
      } else if (categoryRaw) {
        throw new ValidationError('category must be basmati or non_basmati');
      }

      const riceCodes = await riceCodeService.getAllRiceCodes(category);
      return ResponseHandler.success(res, riceCodes.map(toRiceCodeResponse));
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const riceCodeId = validate<string>(uuidSchema, req.params.id);
      const riceCode = await riceCodeService.getRiceCodeById(riceCodeId);
      return ResponseHandler.success(res, toRiceCodeResponse(riceCode));
    } catch (error) {
      next(error);
    }
  }

  async getByName(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { name, category: categoryRaw } = req.query;
      if (!name || typeof name !== 'string') {
        return ResponseHandler.error(res, 'Rice code name is required', 400);
      }
      let category: RiceCategory | undefined;
      if (categoryRaw === 'basmati' || categoryRaw === 'non_basmati') {
        category = categoryRaw;
      } else if (categoryRaw) {
        throw new ValidationError('category must be basmati or non_basmati');
      }

      const riceCode = await riceCodeService.getRiceCodeByName(name, category);
      return ResponseHandler.success(res, toRiceCodeResponse(riceCode));
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const riceCodeData = validate<CreateRiceCodeDTO>(createRiceCodeSchema, req.body);
      if (req.user) {
        riceCodeData.created_by = req.user.userId;
      }
      const riceCode = await riceCodeService.createRiceCode(riceCodeData);
      return ResponseHandler.created(
        res,
        toRiceCodeResponse(riceCode),
        'Rice code created successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const riceCodeId = validate<string>(uuidSchema, req.params.id);
      const riceCodeData = validate<UpdateRiceCodeDTO>(updateRiceCodeSchema, req.body);
      if (req.user) {
        riceCodeData.updated_by = req.user.userId;
      }
      const riceCode = await riceCodeService.updateRiceCode(riceCodeId, riceCodeData);
      return ResponseHandler.success(
        res,
        toRiceCodeResponse(riceCode),
        'Rice code updated successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const riceCodeId = validate<string>(uuidSchema, req.params.id);
      await riceCodeService.deleteRiceCode(riceCodeId);
      return ResponseHandler.success(res, null, 'Rice code deleted successfully');
    } catch (error) {
      next(error);
    }
  }

  /** Top-level step 1: Basmati / Non Basmati */
  async getRiceCategories(_req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      return ResponseHandler.success(res, RICE_CATEGORY_OPTIONS);
    } catch (error) {
      next(error);
    }
  }

  /** Step 3 variants for a category (raw basmati, steam basmati, etc.) */
  async getRiceVariants(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const category = req.query.category as string | undefined;
      if (category === 'basmati') {
        return ResponseHandler.success(res, BASMATI_VARIANT_OPTIONS);
      }
      if (category === 'non_basmati') {
        return ResponseHandler.success(res, NON_BASMATI_VARIANT_OPTIONS);
      }
      throw new ValidationError('category query param is required (basmati or non_basmati)');
    } catch (error) {
      next(error);
    }
  }

  /** @deprecated Use GET /getRiceVariants?category=basmati */
  async getRiceTypes(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    return this.getRiceVariants(req, res, next);
  }
}

export const riceCodeController = new RiceCodeController();
