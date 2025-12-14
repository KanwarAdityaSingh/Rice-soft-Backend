import { Response, NextFunction } from 'express';
import { saudaDAO } from '../dao/sauda.dao';
import { vendorDAO } from '../dao/vendor.dao';
import { brokerDAO } from '../dao/broker.dao';
import { riceCodeDAO } from '../dao/rice-code.dao';
import { ResponseHandler } from '../utils/response';
import {
  validate,
  createSaudaSchema,
  updateSaudaSchema,
  uuidSchema,
} from '../utils/validators';
import {
  NotFoundError,
  ValidationError,
} from '../utils/errors';
import { CreateSaudaDTO, UpdateSaudaDTO, SaudaResponse, SaudaStatus, SaudaType } from '../models/sauda.model';
import { AuthRequest } from '../middleware/auth.middleware';

export class SaudaController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const includeInactive = req.query.include_inactive === 'true';
      const status = req.query.status as SaudaStatus | undefined;
      const saudaType = req.query.sauda_type as SaudaType | undefined;
      const purchaserId = req.query.purchaser_id as string | undefined;
      
      const saudas = await saudaDAO.findAll(includeInactive, status, saudaType, purchaserId);

      const saudaResponses: SaudaResponse[] = saudas.map((sauda) => ({
        id: sauda.id,
        sauda_type: sauda.sauda_type,
        rice_type: sauda.rice_type,
        rice_code_id: sauda.rice_code_id,
        rate: parseFloat(sauda.rate.toString()),
        broker_id: sauda.broker_id,
        broker_commission: sauda.broker_commission ? parseFloat(sauda.broker_commission.toString()) : null,
        quantity: sauda.quantity ? parseFloat(sauda.quantity.toString()) : null,
        cash_discount: sauda.cash_discount ? parseFloat(sauda.cash_discount.toString()) : null,
        estimated_delivery_time: sauda.estimated_delivery_time,
        purchaser_id: sauda.purchaser_id,
        cooked_rice_image_url: sauda.cooked_rice_image_url,
        uncooked_rice_image_url: sauda.uncooked_rice_image_url,
        status: sauda.status,
        notes: sauda.notes,
        created_at: sauda.created_at.toISOString(),
        updated_at: sauda.updated_at.toISOString(),
      }));

      return ResponseHandler.success(res, saudaResponses);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      const sauda = await saudaDAO.findById(id);
      if (!sauda) {
        throw new NotFoundError('Sauda not found');
      }

      const saudaResponse: SaudaResponse = {
        id: sauda.id,
        sauda_type: sauda.sauda_type,
        rice_type: sauda.rice_type,
        rice_code_id: sauda.rice_code_id,
        rate: parseFloat(sauda.rate.toString()),
        broker_id: sauda.broker_id,
        broker_commission: sauda.broker_commission ? parseFloat(sauda.broker_commission.toString()) : null,
        quantity: sauda.quantity ? parseFloat(sauda.quantity.toString()) : null,
        cash_discount: sauda.cash_discount ? parseFloat(sauda.cash_discount.toString()) : null,
        estimated_delivery_time: sauda.estimated_delivery_time,
        purchaser_id: sauda.purchaser_id,
        cooked_rice_image_url: sauda.cooked_rice_image_url,
        uncooked_rice_image_url: sauda.uncooked_rice_image_url,
        status: sauda.status,
        notes: sauda.notes,
        created_at: sauda.created_at.toISOString(),
        updated_at: sauda.updated_at.toISOString(),
      };

      return ResponseHandler.success(res, saudaResponse);
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const saudaData = validate<CreateSaudaDTO>(createSaudaSchema, req.body);

      // Validate purchaser exists
      const purchaser = await vendorDAO.findById(saudaData.purchaser_id);
      if (!purchaser) {
        throw new NotFoundError('Purchaser (vendor) not found');
      }

      // Validate broker if provided
      if (saudaData.broker_id) {
        const broker = await brokerDAO.findById(saudaData.broker_id);
        if (!broker) {
          throw new NotFoundError('Broker not found');
        }
      }

      // Validate rice_code if provided
      if (saudaData.rice_code_id) {
        const riceCode = await riceCodeDAO.findById(saudaData.rice_code_id);
        if (!riceCode) {
          throw new NotFoundError('Rice code not found');
        }
      }

      // Set created_by from authenticated user
      if (req.user) {
        saudaData.created_by = req.user.userId;
      }

      const sauda = await saudaDAO.create(saudaData);

      const saudaResponse: SaudaResponse = {
        id: sauda.id,
        sauda_type: sauda.sauda_type,
        rice_type: sauda.rice_type,
        rice_code_id: sauda.rice_code_id,
        rate: parseFloat(sauda.rate.toString()),
        broker_id: sauda.broker_id,
        broker_commission: sauda.broker_commission ? parseFloat(sauda.broker_commission.toString()) : null,
        quantity: sauda.quantity ? parseFloat(sauda.quantity.toString()) : null,
        cash_discount: sauda.cash_discount ? parseFloat(sauda.cash_discount.toString()) : null,
        estimated_delivery_time: sauda.estimated_delivery_time,
        purchaser_id: sauda.purchaser_id,
        cooked_rice_image_url: sauda.cooked_rice_image_url,
        uncooked_rice_image_url: sauda.uncooked_rice_image_url,
        status: sauda.status,
        notes: sauda.notes,
        created_at: sauda.created_at.toISOString(),
        updated_at: sauda.updated_at.toISOString(),
      };

      return ResponseHandler.created(res, saudaResponse, 'Sauda created successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const saudaData = validate<UpdateSaudaDTO>(updateSaudaSchema, req.body);

      // Check if sauda exists
      const existingSauda = await saudaDAO.findById(id);
      if (!existingSauda) {
        throw new NotFoundError('Sauda not found');
      }

      // Validate purchaser if being updated
      if (saudaData.purchaser_id) {
        const purchaser = await vendorDAO.findById(saudaData.purchaser_id);
        if (!purchaser) {
          throw new NotFoundError('Purchaser (vendor) not found');
        }
      }

      // Validate broker if being updated
      if (saudaData.broker_id !== undefined && saudaData.broker_id !== null) {
        const broker = await brokerDAO.findById(saudaData.broker_id);
        if (!broker) {
          throw new NotFoundError('Broker not found');
        }
      }

      // Validate rice_code if being updated
      if (saudaData.rice_code_id !== undefined && saudaData.rice_code_id !== null) {
        const riceCode = await riceCodeDAO.findById(saudaData.rice_code_id);
        if (!riceCode) {
          throw new NotFoundError('Rice code not found');
        }
      }

      // Set updated_by from authenticated user
      if (req.user) {
        saudaData.updated_by = req.user.userId;
      }

      const sauda = await saudaDAO.update(id, saudaData);
      if (!sauda) {
        throw new NotFoundError('Sauda not found after update');
      }

      const saudaResponse: SaudaResponse = {
        id: sauda.id,
        sauda_type: sauda.sauda_type,
        rice_type: sauda.rice_type,
        rice_code_id: sauda.rice_code_id,
        rate: parseFloat(sauda.rate.toString()),
        broker_id: sauda.broker_id,
        broker_commission: sauda.broker_commission ? parseFloat(sauda.broker_commission.toString()) : null,
        quantity: sauda.quantity ? parseFloat(sauda.quantity.toString()) : null,
        cash_discount: sauda.cash_discount ? parseFloat(sauda.cash_discount.toString()) : null,
        estimated_delivery_time: sauda.estimated_delivery_time,
        purchaser_id: sauda.purchaser_id,
        cooked_rice_image_url: sauda.cooked_rice_image_url,
        uncooked_rice_image_url: sauda.uncooked_rice_image_url,
        status: sauda.status,
        notes: sauda.notes,
        created_at: sauda.created_at.toISOString(),
        updated_at: sauda.updated_at.toISOString(),
      };

      return ResponseHandler.success(res, saudaResponse, 'Sauda updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async updateStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const { status } = req.body;

      if (!status || !['draft', 'active', 'completed', 'cancelled'].includes(status)) {
        throw new ValidationError('Invalid status. Must be one of: draft, active, completed, cancelled');
      }

      const sauda = await saudaDAO.update(id, { 
        status: status as SaudaStatus,
        updated_by: req.user?.userId 
      });

      if (!sauda) {
        throw new NotFoundError('Sauda not found');
      }

      const saudaResponse: SaudaResponse = {
        id: sauda.id,
        sauda_type: sauda.sauda_type,
        rice_type: sauda.rice_type,
        rice_code_id: sauda.rice_code_id,
        rate: parseFloat(sauda.rate.toString()),
        broker_id: sauda.broker_id,
        broker_commission: sauda.broker_commission ? parseFloat(sauda.broker_commission.toString()) : null,
        quantity: sauda.quantity ? parseFloat(sauda.quantity.toString()) : null,
        cash_discount: sauda.cash_discount ? parseFloat(sauda.cash_discount.toString()) : null,
        estimated_delivery_time: sauda.estimated_delivery_time,
        purchaser_id: sauda.purchaser_id,
        cooked_rice_image_url: sauda.cooked_rice_image_url,
        uncooked_rice_image_url: sauda.uncooked_rice_image_url,
        status: sauda.status,
        notes: sauda.notes,
        created_at: sauda.created_at.toISOString(),
        updated_at: sauda.updated_at.toISOString(),
      };

      return ResponseHandler.success(res, saudaResponse, 'Sauda status updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      const sauda = await saudaDAO.findById(id);
      if (!sauda) {
        throw new NotFoundError('Sauda not found');
      }

      const deleted = await saudaDAO.delete(id);
      if (!deleted) {
        throw new NotFoundError('Sauda not found after deletion');
      }

      return ResponseHandler.success(res, null, 'Sauda deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const saudaController = new SaudaController();

