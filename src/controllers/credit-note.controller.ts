import { Response, NextFunction } from 'express';
import { creditNoteService } from '../services/credit-note.service';
import { ResponseHandler } from '../utils/response';
import { validate, createCreditNoteSchema, uuidSchema } from '../utils/validators';
import { AuthRequest } from '../middleware/auth.middleware';
import { CreditNoteLine } from '../models/credit-note-line.model';

function formatLine(line: CreditNoteLine) {
  return {
    id: line.id,
    credit_note_id: line.credit_note_id,
    invoice_dispatch_line_id: line.invoice_dispatch_line_id,
    product_id: line.product_id,
    quantity_returned: parseFloat(line.quantity_returned.toString()),
    created_at: line.created_at instanceof Date ? line.created_at.toISOString() : line.created_at,
    updated_at: line.updated_at instanceof Date ? line.updated_at.toISOString() : line.updated_at,
  };
}

function formatCreditNote(cn: any) {
  return {
    id: cn.id,
    invoice_dispatch_id: cn.invoice_dispatch_id,
    sales_sauda_id: cn.sales_sauda_id,
    credit_note_number: cn.credit_note_number,
    credit_note_date: typeof cn.credit_note_date === 'string' ? cn.credit_note_date : cn.credit_note_date?.toISOString?.()?.split('T')[0] ?? null,
    financial_year: cn.financial_year,
    status: cn.status,
    reason: cn.reason,
    created_at: cn.created_at instanceof Date ? cn.created_at.toISOString() : cn.created_at,
    updated_at: cn.updated_at instanceof Date ? cn.updated_at.toISOString() : cn.updated_at,
    lines: Array.isArray(cn.lines) ? cn.lines.map(formatLine) : [],
  };
}

export class CreditNoteController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const invoiceDispatchId = req.query.invoice_dispatch_id as string | undefined;
      const status = req.query.status as 'draft' | 'confirmed' | undefined;
      const financialYear = req.query.financial_year as string | undefined;
      const list = await creditNoteService.list(invoiceDispatchId, status, financialYear);
      const data = list.map((c) => formatCreditNote({ ...c, lines: [] }));
      return ResponseHandler.success(res, data);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const cn = await creditNoteService.getById(id);
      return ResponseHandler.success(res, formatCreditNote(cn));
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const body = validate<{ invoice_dispatch_id: string; sales_sauda_id: string; credit_note_number: string; credit_note_date?: string; reason?: string; lines: Array<{ invoice_dispatch_line_id: string; product_id: string; quantity_returned: number }> }>(createCreditNoteSchema, req.body);
      const userId = req.user?.userId;
      const cn = await creditNoteService.create(
        {
          invoice_dispatch_id: body.invoice_dispatch_id,
          sales_sauda_id: body.sales_sauda_id,
          credit_note_number: body.credit_note_number,
          credit_note_date: body.credit_note_date,
          reason: body.reason,
          lines: body.lines,
        },
        userId
      );
      return ResponseHandler.created(res, formatCreditNote(cn), 'Credit note created successfully');
    } catch (error) {
      next(error);
    }
  }

  async confirm(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const userId = req.user?.userId;
      const cn = await creditNoteService.confirm(id, userId);
      return ResponseHandler.success(res, formatCreditNote(cn), 'Credit note confirmed successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const creditNoteController = new CreditNoteController();
