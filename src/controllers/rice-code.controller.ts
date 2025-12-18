import { Response, NextFunction } from 'express';
import { riceCodeService } from '../services/rice-code.service';
import { ResponseHandler } from '../utils/response';
import { validate, uuidSchema } from '../utils/validators';
import { AuthRequest } from '../middleware/auth.middleware';
import { CreateRiceCodeDTO, UpdateRiceCodeDTO, RiceCodeResponse } from '../models/rice-code.model';
import {
  createRiceCodeSchema,
  updateRiceCodeSchema,
} from '../utils/validators';

export class RiceCodeController {
  async getAll(_req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const riceCodes = await riceCodeService.getAllRiceCodes();

      const riceCodeResponses: RiceCodeResponse[] = riceCodes.map((riceCode) => ({
        rice_code_id: riceCode.rice_code_id,
        rice_code_name: riceCode.rice_code_name,
        created_at: riceCode.created_at.toISOString(),
        updated_at: riceCode.updated_at.toISOString(),
        created_by: riceCode.created_by,
        updated_by: riceCode.updated_by,
      }));

      return ResponseHandler.success(res, riceCodeResponses);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const riceCodeId = validate<string>(uuidSchema, req.params.id);

      const riceCode = await riceCodeService.getRiceCodeById(riceCodeId);

      const riceCodeResponse: RiceCodeResponse = {
        rice_code_id: riceCode.rice_code_id,
        rice_code_name: riceCode.rice_code_name,
        created_at: riceCode.created_at.toISOString(),
        updated_at: riceCode.updated_at.toISOString(),
        created_by: riceCode.created_by,
        updated_by: riceCode.updated_by,
      };

      return ResponseHandler.success(res, riceCodeResponse);
    } catch (error) {
      next(error);
    }
  }

  async getByName(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { name } = req.query;
      if (!name || typeof name !== 'string') {
        return ResponseHandler.error(res, 'Rice code name is required', 400);
      }

      const riceCode = await riceCodeService.getRiceCodeByName(name);

      const riceCodeResponse: RiceCodeResponse = {
        rice_code_id: riceCode.rice_code_id,
        rice_code_name: riceCode.rice_code_name,
        created_at: riceCode.created_at.toISOString(),
        updated_at: riceCode.updated_at.toISOString(),
        created_by: riceCode.created_by,
        updated_by: riceCode.updated_by,
      };

      return ResponseHandler.success(res, riceCodeResponse);
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const riceCodeData = validate<CreateRiceCodeDTO>(createRiceCodeSchema, req.body);

      // Set created_by from authenticated user
      if (req.user) {
        riceCodeData.created_by = req.user.userId;
      }

      const riceCode = await riceCodeService.createRiceCode(riceCodeData);

      const riceCodeResponse: RiceCodeResponse = {
        rice_code_id: riceCode.rice_code_id,
        rice_code_name: riceCode.rice_code_name,
        created_at: riceCode.created_at.toISOString(),
        updated_at: riceCode.updated_at.toISOString(),
        created_by: riceCode.created_by,
        updated_by: riceCode.updated_by,
      };

      return ResponseHandler.created(res, riceCodeResponse, 'Rice code created successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const riceCodeId = validate<string>(uuidSchema, req.params.id);
      const riceCodeData = validate<UpdateRiceCodeDTO>(updateRiceCodeSchema, req.body);

      // Set updated_by from authenticated user
      if (req.user) {
        riceCodeData.updated_by = req.user.userId;
      }

      const riceCode = await riceCodeService.updateRiceCode(riceCodeId, riceCodeData);

      const riceCodeResponse: RiceCodeResponse = {
        rice_code_id: riceCode.rice_code_id,
        rice_code_name: riceCode.rice_code_name,
        created_at: riceCode.created_at.toISOString(),
        updated_at: riceCode.updated_at.toISOString(),
        created_by: riceCode.created_by,
        updated_by: riceCode.updated_by,
      };

      return ResponseHandler.success(res, riceCodeResponse, 'Rice code updated successfully');
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

  async getRiceTypes(_req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const riceTypes = [
        { value: 'raw_basmati', label: 'Raw Basmati' },
        { value: 'steam_basmati', label: 'Steam Basmati' },
        { value: 'white_sella', label: 'White Sella(Parboiled)' },
        { value: 'golden_sella', label: 'Golden Sella(Parboiled)' },
      ];

      return ResponseHandler.success(res, riceTypes);
    } catch (error) {
      next(error);
    }
  }
}

