import { Response, NextFunction } from 'express';
import { parameterService } from '../services/parameter.service';
import { ResponseHandler } from '../utils/response';
import {
  validate,
  uuidSchema,
  createParameterSchema,
  updateParameterSchema,
  listParametersQuerySchema,
} from '../utils/validators';
import { AuthRequest } from '../middleware/auth.middleware';
import { CreateParameterDTO, ParameterResponse, UpdateParameterDTO } from '../models/parameter.model';

function toResponse(row: {
  id: string;
  inward_slip_pass_id: string | null;
  product_id: string | null;
  batch_id: string | null;
  purity: string | null;
  natural_admixture: string | null;
  average_grain_length: string | null;
  moisture: string | null;
  broken_grain: string | null;
  damage_discolour_grain: string | null;
  immature_grains: string | null;
  whiteness: string | null;
  foreign_matter: string | null;
  black_grains: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}): ParameterResponse {
  return {
    id: row.id,
    inward_slip_pass_id: row.inward_slip_pass_id,
    product_id: row.product_id,
    batch_id: row.batch_id,
    purity: row.purity,
    natural_admixture: row.natural_admixture,
    average_grain_length: row.average_grain_length,
    moisture: row.moisture,
    broken_grain: row.broken_grain,
    damage_discolour_grain: row.damage_discolour_grain,
    immature_grains: row.immature_grains,
    whiteness: row.whiteness,
    foreign_matter: row.foreign_matter,
    black_grains: row.black_grains,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    created_by: row.created_by,
    updated_by: row.updated_by,
  };
}

export class ParameterController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const q = validate<{
        batch_id?: string;
        product_id?: string;
        inward_slip_pass_id?: string;
      }>(listParametersQuerySchema, req.query);

      const rows = await parameterService.list({
        batch_id: q.batch_id,
        product_id: q.product_id,
        inward_slip_pass_id: q.inward_slip_pass_id,
      });
      return ResponseHandler.success(res, rows.map(toResponse));
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const row = await parameterService.getById(id);
      return ResponseHandler.success(res, toResponse(row));
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const body = validate<CreateParameterDTO>(createParameterSchema, req.body);
      if (req.user) {
        body.created_by = req.user.userId;
      }
      const row = await parameterService.create(body);
      return ResponseHandler.created(res, toResponse(row), 'Parameter record created successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const payload: Record<string, unknown> = { ...req.body };
      if (req.user) {
        payload.updated_by = req.user.userId;
      }
      const body = validate<UpdateParameterDTO>(updateParameterSchema, payload);
      const row = await parameterService.update(id, body);
      return ResponseHandler.success(res, toResponse(row), 'Parameter record updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      await parameterService.delete(id);
      return ResponseHandler.success(res, null, 'Parameter record deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const parameterController = new ParameterController();
