import { Response, NextFunction } from 'express';
import { ResponseHandler } from '../utils/response';
import { validate, uuidSchema } from '../utils/validators';
import { AuthRequest } from '../middleware/auth.middleware';
import { salesmanCommissionLedgerService } from '../services/salesman-commission-ledger.service';
import { salesmanReportService } from '../services/salesman-report.service';
import {
  SalesmanCommissionEntry,
  SalesmanCommissionEntryResponse,
  SalesmanCommissionEntryStatus,
} from '../models/salesman-commission-entry.model';
import type { SalesmanCommissionConfig } from '../constants/salesman-commission-types';
import Joi from 'joi';
import { ValidationError } from '../utils/errors';

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  return value.toISOString();
}

function toEntryResponse(entry: SalesmanCommissionEntry): SalesmanCommissionEntryResponse {
  return {
    id: entry.id,
    salesman_id: entry.salesman_id,
    salesman_name: entry.salesman_name ?? null,
    sales_sauda_id: entry.sales_sauda_id,
    invoice_dispatch_id: entry.invoice_dispatch_id,
    credit_note_id: entry.credit_note_id,
    entry_type: entry.entry_type,
    commission_type: entry.commission_type,
    commission_config: (entry.commission_config || {}) as SalesmanCommissionConfig,
    basis_quantity: Number(entry.basis_quantity),
    basis_sale_amount: Number(entry.basis_sale_amount),
    commission_amount: Number(entry.commission_amount),
    status: entry.status,
    approved_at: toIso(entry.approved_at),
    approved_by: entry.approved_by,
    paid_at: toIso(entry.paid_at),
    paid_by: entry.paid_by,
    notes: entry.notes,
    order_number: entry.order_number ?? null,
    invoice_number: entry.invoice_number ?? null,
    credit_note_number: entry.credit_note_number ?? null,
    party_name: entry.party_name ?? null,
    created_at: toIso(entry.created_at)!,
    updated_at: toIso(entry.updated_at)!,
  };
}

const reportQuerySchema = Joi.object({
  salesman_id: Joi.string().uuid().required(),
  from: Joi.string().optional().isoDate(),
  to: Joi.string().optional().isoDate(),
});

const commissionReportQuerySchema = Joi.object({
  salesman_id: Joi.string().optional().uuid(),
  status: Joi.string().optional().valid('pending', 'approved', 'paid'),
  from: Joi.string().optional().isoDate(),
  to: Joi.string().optional().isoDate(),
  view: Joi.string().optional().valid('transaction', 'monthly').default('transaction'),
});

const listEntriesQuerySchema = Joi.object({
  salesman_id: Joi.string().optional().uuid(),
  status: Joi.string().optional().valid('pending', 'approved', 'paid'),
  from: Joi.string().optional().isoDate(),
  to: Joi.string().optional().isoDate(),
});

export class SalesmanCommissionReportController {
  async monthlyReport(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const query = validate<{ salesman_id: string; from?: string; to?: string }>(
        reportQuerySchema,
        req.query
      );
      const data = await salesmanReportService.monthly({
        salesmanId: query.salesman_id,
        from: query.from,
        to: query.to,
      });
      return ResponseHandler.success(res, data);
    } catch (error) {
      next(error);
    }
  }

  async returnsReport(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const query = validate<{ salesman_id: string; from?: string; to?: string }>(
        reportQuerySchema,
        req.query
      );
      const data = await salesmanReportService.returns({
        salesmanId: query.salesman_id,
        from: query.from,
        to: query.to,
      });
      return ResponseHandler.success(res, data);
    } catch (error) {
      next(error);
    }
  }

  async commissionReport(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> {
    try {
      const query = validate<{
        salesman_id?: string;
        status?: SalesmanCommissionEntryStatus;
        from?: string;
        to?: string;
        view?: 'transaction' | 'monthly';
      }>(commissionReportQuerySchema, req.query);
      const data = await salesmanReportService.commission({
        salesmanId: query.salesman_id,
        status: query.status,
        from: query.from,
        to: query.to,
        view: query.view,
      });
      if (data.view === 'transaction') {
        return ResponseHandler.success(res, {
          view: data.view,
          rows: data.rows.map(toEntryResponse),
          totals: data.totals,
        });
      }
      return ResponseHandler.success(res, data);
    } catch (error) {
      next(error);
    }
  }

  async outstandingReport(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> {
    try {
      const query = validate<{ salesman_id: string }>(
        Joi.object({ salesman_id: Joi.string().uuid().required() }),
        req.query
      );
      const data = await salesmanReportService.outstanding({ salesmanId: query.salesman_id });
      return ResponseHandler.success(res, data);
    } catch (error) {
      next(error);
    }
  }

  async listEntries(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const query = validate<{
        salesman_id?: string;
        status?: SalesmanCommissionEntryStatus;
        from?: string;
        to?: string;
      }>(listEntriesQuerySchema, req.query);
      const rows = await salesmanCommissionLedgerService.list({
        salesmanId: query.salesman_id,
        status: query.status,
        from: query.from,
        to: query.to,
      });
      return ResponseHandler.success(res, rows.map(toEntryResponse));
    } catch (error) {
      next(error);
    }
  }

  async getEntry(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const entry = await salesmanCommissionLedgerService.getById(id);
      return ResponseHandler.success(res, toEntryResponse(entry));
    } catch (error) {
      next(error);
    }
  }

  async approve(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      if (!req.user?.userId) throw new ValidationError('Authentication required');
      const entry = await salesmanCommissionLedgerService.approve(id, req.user.userId);
      return ResponseHandler.success(res, toEntryResponse(entry), 'Commission approved');
    } catch (error) {
      next(error);
    }
  }

  async markPaid(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      if (!req.user?.userId) throw new ValidationError('Authentication required');
      const entry = await salesmanCommissionLedgerService.markPaid(id, req.user.userId);
      return ResponseHandler.success(res, toEntryResponse(entry), 'Commission marked paid');
    } catch (error) {
      next(error);
    }
  }
}

export const salesmanCommissionReportController = new SalesmanCommissionReportController();
