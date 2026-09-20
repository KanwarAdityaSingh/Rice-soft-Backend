import { Response, NextFunction } from 'express';
import { eWayBillService } from '../services/e-way-bill.service';
import { ResponseHandler } from '../utils/response';
import {
  validate,
  uuidSchema,
  generateEWayBillSchema,
  cancelEWayBillSchema,
  lookupEWayBillsSchema,
} from '../utils/validators';
import type { EWayBillCancelReason } from '../constants/e-way-bill';
import { AuthRequest } from '../middleware/auth.middleware';

export class EWayBillController {
  async getByDispatchId(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const payload = await eWayBillService.getByInvoiceDispatchId(id);
      return ResponseHandler.success(res, payload);
    } catch (error) {
      next(error);
    }
  }

  /** POST /invoice-dispatches/e-way-bills/lookup — { ids } → map id → latest EWB | null */
  async lookupLatest(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const body = validate<{ ids: string[] }>(lookupEWayBillsSchema, req.body);
      const payload = await eWayBillService.lookupLatestByInvoiceDispatchIds(body.ids);
      return ResponseHandler.success(res, payload);
    } catch (error) {
      next(error);
    }
  }

  async preview(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const body = validate<{
        vehicle_number?: string;
        distance_km?: number;
        route?: string;
        transporter_id?: string;
        lr_number?: string | null;
      }>(generateEWayBillSchema, req.body || {});
      const payload = await eWayBillService.previewForDispatch(id, {
        vehicle_number: body.vehicle_number,
        distance_km: body.distance_km,
        route: body.route,
        transporter_id: body.transporter_id,
        lr_number: body.lr_number,
      });
      return ResponseHandler.success(res, payload, 'E-Way Bill preview generated successfully');
    } catch (error) {
      next(error);
    }
  }

  async generate(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const body = validate<{
        vehicle_number?: string;
        distance_km?: number;
        route?: string;
        transporter_id?: string;
        lr_number?: string | null;
      }>(generateEWayBillSchema, req.body || {});
      const payload = await eWayBillService.generateForDispatch(id, {
        vehicle_number: body.vehicle_number,
        distance_km: body.distance_km,
        route: body.route,
        transporter_id: body.transporter_id,
        lr_number: body.lr_number,
      });
      return ResponseHandler.success(res, payload, 'E-Way Bill generated successfully');
    } catch (error) {
      next(error);
    }
  }

  async cancel(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const body = validate<{
        reason_of_cancel: EWayBillCancelReason;
        cancel_remark: string;
      }>(cancelEWayBillSchema, req.body || {});
      const payload = await eWayBillService.cancelForDispatch(id, {
        reason_of_cancel: body.reason_of_cancel,
        cancel_remark: body.cancel_remark,
      });
      return ResponseHandler.success(res, payload, 'E-Way Bill cancelled successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const eWayBillController = new EWayBillController();
