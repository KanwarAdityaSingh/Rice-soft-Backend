import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { ResponseHandler } from '../utils/response';
import { validate, uuidSchema } from '../utils/validators';
import { couponAllotmentService } from '../services/coupon-allotment.service';
import {
  previewAllotmentSchema,
  confirmAllotmentSchema,
  unlinkAllotmentLineSchema,
  allotmentHistoryQuerySchema,
  invoiceAllotmentSummaryQuerySchema,
} from '../utils/coupon.validators';
import {
  AllotmentHistoryFilters,
  ConfirmAllotmentLineRequest,
  InvoiceAllotmentSummaryFilters,
  PreviewAllotmentRequest,
} from '../models/coupon-allotment.model';
import { parseSearchQuery } from '../utils/search';
import { parsePaginationQuery, toPaginatedResult } from '../utils/pagination';

export class CouponAllotmentController {
  async getAllotmentCandidates(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const invoiceDispatchId = validate<string>(uuidSchema, req.params.invoiceDispatchId);
      const result = await couponAllotmentService.getAllotmentCandidates(invoiceDispatchId);
      return ResponseHandler.success(res, result);
    } catch (error) {
      next(error);
    }
  }

  async getAllotmentForDispatch(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const invoiceDispatchId = validate<string>(uuidSchema, req.params.invoiceDispatchId);
      const result = await couponAllotmentService.getHeaderWithLinesByInvoiceDispatchId(invoiceDispatchId);
      return ResponseHandler.success(res, result);
    } catch (error) {
      next(error);
    }
  }

  async previewAllotment(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      validate<string>(uuidSchema, req.params.invoiceDispatchId);
      const body = validate<PreviewAllotmentRequest>(previewAllotmentSchema, req.body);
      const result = await couponAllotmentService.previewAllotment(body);
      return ResponseHandler.success(res, result);
    } catch (error) {
      next(error);
    }
  }

  async confirmAllotment(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const invoiceDispatchId = validate<string>(uuidSchema, req.params.invoiceDispatchId);
      const body = validate<{ lines: ConfirmAllotmentLineRequest[] }>(confirmAllotmentSchema, req.body);
      const result = await couponAllotmentService.confirmAllotment(
        invoiceDispatchId,
        body.lines,
        req.user?.userId
      );
      return ResponseHandler.success(res, result, 'Coupons allotted');
    } catch (error) {
      next(error);
    }
  }

  async unlinkAllotmentLine(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const lineId = validate<string>(uuidSchema, req.params.lineId);
      const body = validate<{ reason: string }>(unlinkAllotmentLineSchema, req.body);
      const result = await couponAllotmentService.unlinkAllotmentLine(lineId, body.reason, req.user?.userId);
      return ResponseHandler.success(res, result, 'Allotment line unlinked');
    } catch (error) {
      next(error);
    }
  }

  async getAllotmentHistory(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const query = validate<AllotmentHistoryFilters & { q?: string }>(
        allotmentHistoryQuerySchema,
        req.query
      );
      const result = await couponAllotmentService.getAllotmentHistory({
        ...query,
        search: parseSearchQuery(query),
      });
      return ResponseHandler.success(res, result);
    } catch (error) {
      next(error);
    }
  }

  async listInvoiceAllotmentSummaries(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> {
    try {
      const query = validate<InvoiceAllotmentSummaryFilters & { q?: string }>(
        invoiceAllotmentSummaryQuerySchema,
        req.query
      );
      const { page, limit } = parsePaginationQuery(query);
      const { rows, total } = await couponAllotmentService.listInvoiceAllotmentSummaries({
        search: parseSearchQuery(query),
        fulfillment: query.fulfillment,
        page,
        limit,
      });
      return ResponseHandler.success(res, toPaginatedResult(rows, total, page, limit));
    } catch (error) {
      next(error);
    }
  }

  async getBatchAllotmentProgress(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const batchId = validate<string>(uuidSchema, req.params.batchId);
      const result = await couponAllotmentService.getBatchProgress(batchId);
      return ResponseHandler.success(res, result);
    } catch (error) {
      next(error);
    }
  }
}

export const couponAllotmentController = new CouponAllotmentController();
