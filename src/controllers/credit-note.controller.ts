import { Response, NextFunction } from 'express';
import { creditNoteService } from '../services/credit-note.service';
import { ResponseHandler } from '../utils/response';
import { parsePaginationQuery, toPaginatedResult } from '../utils/pagination';
import { parseSearchQuery } from '../utils/search';
import {
  validate,
  createCreditNoteSchema,
  updateCreditNoteSchema,
  cancelCreditNoteSchema,
  creditNoteAttachmentTypeSchema,
  uuidSchema,
} from '../utils/validators';
import { AuthRequest } from '../middleware/auth.middleware';
import { CreditNoteLine } from '../models/credit-note-line.model';
import {
  CreateCreditNoteRequest,
  CreditNoteStatus,
  CreditNoteType,
  UpdateCreditNoteRequest,
} from '../models/credit-note.model';
import type { CreditNoteAttachmentType } from '../constants/credit-note';
import { CREDIT_NOTE_STATUSES, CREDIT_NOTE_TYPES } from '../constants/credit-note';
import {
  uploadToS3,
  validateFileSize,
  validateFileType,
} from '../utils/s3-upload';
import { appConfig } from '../config/app.config';
import { InternalServerError, ValidationError } from '../utils/errors';

function n(value: unknown): number {
  const parsed = parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatLine(line: CreditNoteLine) {
  return {
    id: line.id,
    credit_note_id: line.credit_note_id,
    invoice_dispatch_line_id: line.invoice_dispatch_line_id,
    product_id: line.product_id,
    product_alias: line.product_alias ?? null,
    brand: line.brand ?? null,
    hsn_code: line.hsn_code ?? null,
    quantity_returned: n(line.quantity_returned),
    quantity_credited: n(line.quantity_credited),
    quantity_invoiced: line.quantity_invoiced != null ? n(line.quantity_invoiced) : null,
    quantity_actual_returned:
      line.quantity_actual_returned != null ? n(line.quantity_actual_returned) : null,
    quantity_verified: line.quantity_verified != null ? n(line.quantity_verified) : null,
    quantity_short: line.quantity_short != null ? n(line.quantity_short) : null,
    original_rate: line.original_rate != null ? n(line.original_rate) : null,
    corrected_rate: line.corrected_rate != null ? n(line.corrected_rate) : null,
    credit_taxable_input:
      line.credit_taxable_input != null ? n(line.credit_taxable_input) : null,
    rate: line.rate != null ? n(line.rate) : null,
    gst_percent: line.gst_percent != null ? n(line.gst_percent) : null,
    discount_value: line.discount_value != null ? n(line.discount_value) : null,
    discount_type: line.discount_type,
    taxable_amount: n(line.taxable_amount),
    cgst_amount: n(line.cgst_amount),
    sgst_amount: n(line.sgst_amount),
    igst_amount: n(line.igst_amount),
    final_amount: n(line.final_amount),
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
    credit_note_date:
      typeof cn.credit_note_date === 'string'
        ? cn.credit_note_date
        : cn.credit_note_date?.toISOString?.()?.split('T')[0] ?? null,
    financial_year: cn.financial_year,
    serial_number: cn.serial_number != null ? Number(cn.serial_number) : null,
    credit_note_type: cn.credit_note_type,
    status: cn.status,
    reason: cn.reason,
    coupon_status: cn.coupon_status,
    material_condition: cn.material_condition,
    receiving_godown_id: cn.receiving_godown_id,
    taxable_amount: n(cn.taxable_amount),
    cgst_amount: n(cn.cgst_amount),
    sgst_amount: n(cn.sgst_amount),
    igst_amount: n(cn.igst_amount),
    total_credit_amount: n(cn.total_credit_amount),
    posted_at: cn.posted_at instanceof Date ? cn.posted_at.toISOString() : cn.posted_at ?? null,
    posted_by: cn.posted_by ?? null,
    cancelled_at:
      cn.cancelled_at instanceof Date ? cn.cancelled_at.toISOString() : cn.cancelled_at ?? null,
    cancelled_by: cn.cancelled_by ?? null,
    cancel_reason: cn.cancel_reason ?? null,
    edit_reason: cn.edit_reason ?? null,
    created_at: cn.created_at instanceof Date ? cn.created_at.toISOString() : cn.created_at,
    updated_at: cn.updated_at instanceof Date ? cn.updated_at.toISOString() : cn.updated_at,
    invoice_number: cn.invoice_number ?? undefined,
    invoice_date: cn.invoice_date ?? undefined,
    party_name: cn.party_name ?? undefined,
    party_phone: cn.party_phone ?? undefined,
    invoice: cn.invoice ?? undefined,
    financial_summary: cn.financial_summary ?? undefined,
    timeline: cn.timeline ?? undefined,
    attachments: Array.isArray(cn.attachments) ? cn.attachments : undefined,
    lines: Array.isArray(cn.lines) ? cn.lines.map(formatLine) : [],
  };
}

export class CreditNoteController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const invoiceDispatchId = req.query.invoice_dispatch_id as string | undefined;
      const rawStatus = req.query.status as string | undefined;
      const status =
        rawStatus && (CREDIT_NOTE_STATUSES as readonly string[]).includes(rawStatus)
          ? (rawStatus as CreditNoteStatus)
          : undefined;
      const rawType = req.query.credit_note_type as string | undefined;
      const creditNoteType =
        rawType && (CREDIT_NOTE_TYPES as readonly string[]).includes(rawType)
          ? (rawType as CreditNoteType)
          : undefined;
      const financialYear = req.query.financial_year as string | undefined;
      const partyId = req.query.party_id as string | undefined;
      const dateFrom = req.query.date_from as string | undefined;
      const dateTo = req.query.date_to as string | undefined;
      const sortBy = req.query.sort_by as string | undefined;
      const sortDir = req.query.sort_dir === 'asc' ? 'asc' : 'desc';
      const search = parseSearchQuery(req.query);
      const { page, limit, offset } = parsePaginationQuery(req.query);
      const { rows, total } = await creditNoteService.list({
        invoiceDispatchId,
        status,
        creditNoteType,
        financialYear,
        partyId,
        dateFrom,
        dateTo,
        search,
        sortBy,
        sortDir,
        pagination: { limit, offset },
      });
      return ResponseHandler.success(
        res,
        toPaginatedResult(
          rows.map((c) => formatCreditNote({ ...c, lines: [] })),
          total,
          page,
          limit
        )
      );
    } catch (error) {
      next(error);
    }
  }

  async listEligibleInvoices(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> {
    try {
      const search = parseSearchQuery(req.query);
      const { page, limit, offset } = parsePaginationQuery(req.query);
      const rawGodownId = typeof req.query.godown_id === 'string' ? req.query.godown_id.trim() : '';
      const godownId = rawGodownId ? validate<string>(uuidSchema, rawGodownId) : undefined;
      const { rows, total } = await creditNoteService.listEligibleInvoices({
        search,
        godownId,
        pagination: { limit, offset },
      });
      return ResponseHandler.success(res, toPaginatedResult(rows, total, page, limit));
    } catch (error) {
      next(error);
    }
  }

  async getInvoiceContext(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> {
    try {
      const invoiceDispatchId = validate<string>(uuidSchema, req.params.invoiceDispatchId);
      const ctx = await creditNoteService.getInvoiceContext(invoiceDispatchId);
      return ResponseHandler.success(res, ctx);
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

  async preview(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const payload = await creditNoteService.getPreview(id);
      return ResponseHandler.success(res, payload, 'Credit note preview generated successfully');
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const body = validate<CreateCreditNoteRequest>(createCreditNoteSchema, req.body);
      const cn = await creditNoteService.create(body, req.user?.userId);
      return ResponseHandler.created(res, formatCreditNote(cn), 'Credit note created successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const body = validate<UpdateCreditNoteRequest>(updateCreditNoteSchema, req.body);
      const cn = await creditNoteService.update(id, body, req.user?.userId);
      return ResponseHandler.success(res, formatCreditNote(cn), 'Credit note updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async confirm(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const cn = await creditNoteService.confirm(id, req.user?.userId);
      return ResponseHandler.success(res, formatCreditNote(cn), 'Credit note posted successfully');
    } catch (error) {
      next(error);
    }
  }

  async cancel(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const body = validate<{ reason: string }>(cancelCreditNoteSchema, req.body);
      const cn = await creditNoteService.cancel(id, body.reason, req.user?.userId);
      return ResponseHandler.success(res, formatCreditNote(cn), 'Credit note cancelled successfully');
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      await creditNoteService.delete(id, req.user?.userId);
      return ResponseHandler.success(res, null, 'Credit note deleted successfully');
    } catch (error) {
      next(error);
    }
  }

  async uploadAttachment(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const documentType = validate<CreditNoteAttachmentType>(
        creditNoteAttachmentTypeSchema,
        req.params.type
      );
      if (!req.file) {
        throw new ValidationError('File is required');
      }
      validateFileSize(req.file.size, 10);
      validateFileType(req.file.mimetype, [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'application/pdf',
      ]);

      let uploadResult;
      try {
        uploadResult = await uploadToS3(
          req.file.buffer,
          req.file.originalname,
          appConfig.aws.s3.creditNotesFolder
        );
      } catch {
        throw new InternalServerError('Failed to upload attachment. Please try again.');
      }

      const cn = await creditNoteService.addAttachment(
        id,
        {
          document_type: documentType,
          file_url: uploadResult.url,
          file_name: req.file.originalname,
          mime_type: req.file.mimetype,
        },
        req.user?.userId
      );
      return ResponseHandler.success(res, formatCreditNote(cn), 'Attachment uploaded successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const creditNoteController = new CreditNoteController();
