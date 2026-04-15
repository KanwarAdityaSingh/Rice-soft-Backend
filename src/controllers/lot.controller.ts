import { Response, NextFunction } from 'express';
import { inwardSlipLotDAO } from '../dao/inward-slip-lot.dao';
import { saudaDAO } from '../dao/sauda.dao';
import { riceCodeDAO } from '../dao/rice-code.dao';
import { ResponseHandler } from '../utils/response';
import {
  validate,
  createLotSchema,
  updateLotSchema,
  uuidSchema,
} from '../utils/validators';
import {
  NotFoundError,
} from '../utils/errors';
import {
  CreateInwardSlipLotDTO,
  UpdateInwardSlipLotDTO,
  InwardSlipLot,
  InwardSlipLotResponse,
} from '../models/inward-slip-lot.model';
import { AuthRequest } from '../middleware/auth.middleware';
import { godownService } from '../services/godown.service';

function toInwardSlipLotResponse(lot: InwardSlipLot): InwardSlipLotResponse {
  return {
    id: lot.id,
    sauda_id: lot.sauda_id,
    godown_id: lot.godown_id,
    lot_number: lot.lot_number,
    rice_code_id: lot.rice_code_id,
    rice_type: lot.rice_type,
    no_of_bags: lot.no_of_bags,
    bag_weight: lot.bag_weight ? parseFloat(lot.bag_weight.toString()) : null,
    total_weight: lot.total_weight ? parseFloat(lot.total_weight.toString()) : null,
    bill_weight: parseFloat(lot.bill_weight.toString()),
    received_weight: parseFloat(lot.received_weight.toString()),
    rate: parseFloat(lot.rate.toString()),
    amount: lot.amount ? parseFloat(lot.amount.toString()) : null,
    inward_slip_pass_created_at: lot.inward_slip_pass_created_at
      ? lot.inward_slip_pass_created_at.toISOString()
      : null,
    created_at: lot.created_at.toISOString(),
    updated_at: lot.updated_at.toISOString(),
  };
}

export class LotController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const saudaId = req.query.sauda_id as string | undefined;
      const godownId = req.query.godown_id as string | undefined;
      
      const lots = await inwardSlipLotDAO.findAll(saudaId, godownId);

      const lotResponses: InwardSlipLotResponse[] = lots.map((lot) => toInwardSlipLotResponse(lot));

      return ResponseHandler.success(res, lotResponses);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      const lot = await inwardSlipLotDAO.findById(id);
      if (!lot) {
        throw new NotFoundError('Lot not found');
      }

      return ResponseHandler.success(res, toInwardSlipLotResponse(lot));
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const lotData = validate<CreateInwardSlipLotDTO>(createLotSchema, req.body);

      // Validate sauda exists
      const sauda = await saudaDAO.findById(lotData.sauda_id);
      if (!sauda) {
        throw new NotFoundError('Sauda not found');
      }
      await godownService.assertActive(lotData.godown_id);

      // Validate rice_code if provided
      if (lotData.rice_code_id) {
        const riceCode = await riceCodeDAO.findById(lotData.rice_code_id);
        if (!riceCode) {
          throw new NotFoundError('Rice code not found');
        }
      }

      // Set created_by from authenticated user
      if (req.user) {
        lotData.created_by = req.user.userId;
      }

      const lot = await inwardSlipLotDAO.create(lotData);

      return ResponseHandler.created(res, toInwardSlipLotResponse(lot), 'Lot created successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const lotData = validate<UpdateInwardSlipLotDTO>(updateLotSchema, req.body);

      // Check if lot exists
      const existingLot = await inwardSlipLotDAO.findById(id);
      if (!existingLot) {
        throw new NotFoundError('Lot not found');
      }

      // Set updated_by from authenticated user
      if (req.user) {
        lotData.updated_by = req.user.userId;
      }
      if (lotData.godown_id !== undefined) {
        delete (lotData as any).godown_id;
      }

      const lot = await inwardSlipLotDAO.update(id, lotData);
      if (!lot) {
        throw new NotFoundError('Lot not found after update');
      }

      return ResponseHandler.success(res, toInwardSlipLotResponse(lot), 'Lot updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      const lot = await inwardSlipLotDAO.findById(id);
      if (!lot) {
        throw new NotFoundError('Lot not found');
      }

      const deleted = await inwardSlipLotDAO.delete(id);
      if (!deleted) {
        throw new NotFoundError('Lot not found or could not be deleted');
      }

      // TODO: Trigger recalculation of any linked Purchases
      // This would require finding all purchases linked to this lot and recalculating

      return ResponseHandler.success(res, null, 'Lot deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const lotController = new LotController();

