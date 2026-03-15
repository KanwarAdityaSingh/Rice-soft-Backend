import { Response, NextFunction } from 'express';
import { eInvoiceService } from '../services/e-invoice.service';
import { ResponseHandler } from '../utils/response';
import { validate, uuidSchema } from '../utils/validators';
import { AuthRequest } from '../middleware/auth.middleware';

export class EInvoiceController {
  async getByDispatchId(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const payload = await eInvoiceService.getByInvoiceDispatchId(id);
      return ResponseHandler.success(res, payload ?? null, payload ? undefined : 'No e-invoice found for this dispatch');
    } catch (error) {
      next(error);
    }
  }

  async generate(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const payload = await eInvoiceService.generateForDispatch(id);
      return ResponseHandler.success(res, payload, 'E-Invoice generated successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const eInvoiceController = new EInvoiceController();
