import { Response, NextFunction } from 'express';
import { saudaWeightVarianceDAO, SaudaWeightVarianceFilters } from '../dao/sauda-weight-variance.dao';
import { ResponseHandler } from '../utils/response';
import { parsePaginationQuery, toPaginatedResult } from '../utils/pagination';
import { parseSearchQuery } from '../utils/search';
import { validate, uuidSchema } from '../utils/validators';
import { NotFoundError } from '../utils/errors';
import { AuthRequest } from '../middleware/auth.middleware';
import { SaudaWeightVarianceRecord, SaudaWeightVarianceRecordResponse } from '../models/sauda-weight-variance.model';

function mapToResponse(record: SaudaWeightVarianceRecord): SaudaWeightVarianceRecordResponse {
  return {
    id: record.id,
    sauda_id: record.sauda_id,
    sauda_display_id: record.sauda_display_id!,
    payment_advice_id: record.payment_advice_id,
    payment_advice_sr_number: record.payment_advice_sr_number ?? null,
    inward_slip_pass_id: record.inward_slip_pass_id,
    broker_id: record.broker_id,
    broker_name: record.broker_name ?? null,
    purchaser_id: record.purchaser_id,
    purchaser_name: record.purchaser_name ?? null,
    bill_weight: record.bill_weight,
    kanta_weight: record.kanta_weight,
    variance_kg: record.variance_kg,
    direction: record.direction,
    created_at: record.created_at.toISOString(),
  };
}

export class SaudaWeightVarianceController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { page, limit, offset } = parsePaginationQuery(req.query);
      const search = parseSearchQuery(req.query);

      const filters: SaudaWeightVarianceFilters = {
        saudaId: req.query.sauda_id as string | undefined,
        paymentAdviceId: req.query.payment_advice_id as string | undefined,
        brokerId: req.query.broker_id as string | undefined,
        purchaserId: req.query.purchaser_id as string | undefined,
        direction: req.query.direction as 'short' | 'excess' | undefined,
      };

      const { rows, total } = await saudaWeightVarianceDAO.findAll(filters, { limit, offset }, search);
      const items = rows.map(mapToResponse);

      return ResponseHandler.success(res, toPaginatedResult(items, total, page, limit));
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const record = await saudaWeightVarianceDAO.findById(id);
      if (!record) {
        throw new NotFoundError('Weight variance record not found');
      }
      return ResponseHandler.success(res, mapToResponse(record));
    } catch (error) {
      next(error);
    }
  }
}

export const saudaWeightVarianceController = new SaudaWeightVarianceController();
