import { Response, NextFunction } from 'express';
import { eWayBillService } from '../services/e-way-bill.service';
import { ResponseHandler } from '../utils/response';
import { validate, uuidSchema, generateEWayBillSchema } from '../utils/validators';
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
}

export const eWayBillController = new EWayBillController();
