import { Request, Response, NextFunction } from 'express';
import { ResponseHandler } from '../utils/response';
import { invoiceDispatchPublicService } from '../services/invoice-dispatch-public.service';

export class InvoiceDispatchPublicController {
  async verifyByToken(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const token = String(req.params.token ?? '').trim();
      const result = await invoiceDispatchPublicService.verifyByToken(token);
      return ResponseHandler.success(res, result);
    } catch (error) {
      next(error);
    }
  }
}

export const invoiceDispatchPublicController = new InvoiceDispatchPublicController();
