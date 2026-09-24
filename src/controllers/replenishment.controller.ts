import { Response, NextFunction } from 'express';
import { replenishmentService } from '../services/replenishment.service';
import { ResponseHandler } from '../utils/response';
import { parsePaginationQuery, toPaginatedResult } from '../utils/pagination';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  validate,
  uuidSchema,
  replenishmentPreviewSchema,
  createReplenishmentPlanSchema,
  replaceTruckSizesSchema,
} from '../utils/validators';
import { ValidationError } from '../utils/errors';
import type {
  CreateReplenishmentPlanDTO,
  ReplenishmentPlanDetail,
  ReplenishmentPreviewRequest,
  TruckSizeConfigInput,
} from '../models/replenishment.model';
import type { ReplenishmentPlanStatus } from '../constants/replenishment';
import { REPLENISHMENT_PLAN_STATUSES } from '../constants/replenishment';
import type { InventoryLedgerSourceType } from '../models/inventory-ledger.model';

function iso(d: Date | string | null): string | null {
  if (!d) return null;
  return d instanceof Date ? d.toISOString() : d;
}

function serializePlan(plan: ReplenishmentPlanDetail['plan']) {
  return {
    ...plan,
    created_at: iso(plan.created_at),
    updated_at: iso(plan.updated_at),
    committed_at: iso(plan.committed_at),
  };
}

function serializePlanDetail(detail: ReplenishmentPlanDetail) {
  return {
    ...detail,
    plan: serializePlan(detail.plan),
  };
}

function actorId(req: AuthRequest): string | null {
  return req.user?.userId ?? null;
}

function parseGodownQuery(req: AuthRequest): string {
  const raw = req.query.godown_id as string | undefined;
  if (!raw) throw new ValidationError('godown_id is required');
  return validate<string>(uuidSchema, raw);
}

export class ReplenishmentController {
  async getTruckSizes(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const includeInactive = req.query.include_inactive === 'true';
      const sizes = await replenishmentService.listTruckSizes(!includeInactive);
      return ResponseHandler.success(
        res,
        sizes.map((s) => ({
          ...s,
          created_at: iso(s.created_at),
          updated_at: iso(s.updated_at),
        }))
      );
    } catch (error) {
      next(error);
    }
  }

  async putTruckSizes(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const data = validate<{ sizes: TruckSizeConfigInput[] }>(replaceTruckSizesSchema, req.body);
      const sizes = await replenishmentService.replaceTruckSizes(data.sizes);
      return ResponseHandler.success(res, sizes, 'Truck sizes updated');
    } catch (error) {
      next(error);
    }
  }

  async getStock(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const godownId = parseGodownQuery(req);
      const data = await replenishmentService.getStock(godownId);
      return ResponseHandler.success(res, data);
    } catch (error) {
      next(error);
    }
  }

  async getLedger(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const godownId = parseGodownQuery(req);
      const productId = req.query.product_id as string | undefined;
      if (productId) validate<string>(uuidSchema, productId);
      const { page, limit, offset } = parsePaginationQuery(req.query);
      const { rows, total } = await replenishmentService.getLedger({
        godown_id: godownId,
        product_id: productId,
        source_type: req.query.source_type as InventoryLedgerSourceType | undefined,
        from_date: req.query.from_date as string | undefined,
        to_date: req.query.to_date as string | undefined,
        limit,
        offset,
      });
      return ResponseHandler.success(res, toPaginatedResult(rows, total, page, limit));
    } catch (error) {
      next(error);
    }
  }

  async preview(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const data = validate<ReplenishmentPreviewRequest>(replenishmentPreviewSchema, req.body);
      const preview = await replenishmentService.preview(data);
      return ResponseHandler.success(res, preview);
    } catch (error) {
      next(error);
    }
  }

  async createPlan(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const data = validate<CreateReplenishmentPlanDTO>(createReplenishmentPlanSchema, req.body);
      const plan = await replenishmentService.createPlan(data, actorId(req));
      return ResponseHandler.created(res, serializePlanDetail(plan), 'Replenishment plan saved');
    } catch (error) {
      next(error);
    }
  }

  async listPlans(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const godownId = req.query.godown_id as string | undefined;
      if (godownId) validate<string>(uuidSchema, godownId);
      const statusRaw = req.query.status as string | undefined;
      let status: ReplenishmentPlanStatus | undefined;
      if (statusRaw) {
        if (!(REPLENISHMENT_PLAN_STATUSES as readonly string[]).includes(statusRaw)) {
          throw new ValidationError('Invalid plan status');
        }
        status = statusRaw as ReplenishmentPlanStatus;
      }
      const { page, limit, offset } = parsePaginationQuery(req.query);
      const { rows, total } = await replenishmentService.listPlans({
        godown_id: godownId,
        status,
        limit,
        offset,
      });
      return ResponseHandler.success(
        res,
        toPaginatedResult(rows.map(serializePlan), total, page, limit)
      );
    } catch (error) {
      next(error);
    }
  }

  async getPlan(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const plan = await replenishmentService.getPlan(id);
      return ResponseHandler.success(res, serializePlanDetail(plan));
    } catch (error) {
      next(error);
    }
  }

  async commitPlan(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const plan = await replenishmentService.commitPlan(id, actorId(req));
      return ResponseHandler.success(res, serializePlanDetail(plan), 'Replenishment plan committed');
    } catch (error) {
      next(error);
    }
  }

  async cancelPlan(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const plan = await replenishmentService.cancelPlan(id);
      return ResponseHandler.success(res, serializePlanDetail(plan), 'Replenishment plan cancelled');
    } catch (error) {
      next(error);
    }
  }
}

export const replenishmentController = new ReplenishmentController();
