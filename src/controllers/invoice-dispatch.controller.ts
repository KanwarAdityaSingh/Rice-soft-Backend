import { Response, NextFunction } from 'express';
import { invoiceDispatchService } from '../services/invoice-dispatch.service';
import { invoiceDispatchDAO } from '../dao/invoice-dispatch.dao';
import { ResponseHandler } from '../utils/response';
import { parsePaginationQuery, toPaginatedResult } from '../utils/pagination';
import { parseSearchQuery } from '../utils/search';
import {
  validate,
  createInvoiceDispatchSchema,
  updateInvoiceDispatchSchema,
  cancelInvoiceDispatchSchema,
  uuidSchema,
} from '../utils/validators';
import { AuthRequest } from '../middleware/auth.middleware';
import { normalizeBuyerGstin } from '../constants/gst-state-codes';
import { InvoiceDispatchLine } from '../models/invoice-dispatch-line.model';
import { UpdateInvoiceDispatchDTO } from '../models/invoice-dispatch.model';
import { buildDocumentCompliance } from '../services/invoice-dispatch-document-compliance';
import {
  uploadToS3,
  validateFileSize,
  validateFileType,
} from '../utils/s3-upload';
import { appConfig } from '../config/app.config';
import {
  InternalServerError,
  NotFoundError,
  ValidationError,
} from '../utils/errors';
import { lrExtractionService, LrExtractionResult } from '../services/lr-extraction.service';
import { logger } from '../utils/logger';

const LR_EXTRACTION_IMAGE_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];

/**
 * Best-effort LR/Bilty OCR for a document being uploaded via /upload-bilti or /upload-lr.
 * Bilti and LR copies are, in practice, the same transport receipt under different names —
 * whichever one the user attaches first should still surface the LR number/vehicle match.
 * Only runs for images (vision API doesn't read PDFs) and never blocks the upload: any
 * extraction failure is logged and swallowed so the document is still saved successfully.
 */
async function attemptLrExtraction(file: Express.Multer.File): Promise<LrExtractionResult | null> {
  if (!appConfig.openai.lrExtractionEnabled) {
    return null;
  }
  if (!LR_EXTRACTION_IMAGE_MIME_TYPES.includes(file.mimetype)) {
    return null;
  }
  try {
    return await lrExtractionService.extractLrDetailsFromImage(file.buffer, file.mimetype);
  } catch (error) {
    logger.warn('LR extraction on document upload failed; continuing without it', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function formatLine(line: InvoiceDispatchLine) {
  return {
    id: line.id,
    invoice_dispatch_id: line.invoice_dispatch_id,
    sales_sauda_line_id: line.sales_sauda_line_id,
    product_id: line.product_id ?? null,
    product_alias: line.product_alias ?? null,
    lot_id: line.lot_id ?? null,
    packaging_id: line.packaging_id,
    packet_count:
      line.packet_count != null ? parseInt(line.packet_count.toString(), 10) : null,
    no_of_bags: line.no_of_bags != null ? parseInt(line.no_of_bags.toString(), 10) : null,
    bag_weight: line.bag_weight != null ? parseFloat(line.bag_weight.toString()) : null,
    quantity: parseFloat(line.quantity.toString()),
    quantity_unit: line.quantity_unit,
    rate: parseFloat(line.rate.toString()),
    amount: parseFloat(line.amount.toString()),
    created_at: line.created_at instanceof Date ? line.created_at.toISOString() : line.created_at,
    updated_at: line.updated_at instanceof Date ? line.updated_at.toISOString() : line.updated_at,
  };
}

function formatDispatch(dispatch: any) {
  const salesSaudaIds: string[] = Array.isArray(dispatch.sales_sauda_ids)
    ? dispatch.sales_sauda_ids
    : dispatch.sales_sauda_id
      ? [dispatch.sales_sauda_id]
      : [];
  return {
    id: dispatch.id,
    sales_sauda_id: dispatch.sales_sauda_id,
    sales_sauda_ids: salesSaudaIds,
    godown_id: dispatch.godown_id,
    to_godown_id: dispatch.to_godown_id ?? null,
    serial_number:
      dispatch.serial_number != null ? Number(dispatch.serial_number) : null,
    internal_invoice_number: dispatch.internal_invoice_number,
    dispatch_date: typeof dispatch.dispatch_date === 'string' ? dispatch.dispatch_date : dispatch.dispatch_date?.toISOString?.()?.split('T')[0] ?? null,
    financial_year: dispatch.financial_year,
    party_name: dispatch.party_name,
    party_address: dispatch.party_address,
    // Legacy rows may still be null; expose URP for unregistered parties.
    party_gst_number: normalizeBuyerGstin(dispatch.party_gst_number),
    party_pan_number: dispatch.party_pan_number,
    transporter_id: dispatch.transporter_id,
    vehicle_id: dispatch.vehicle_id,
    driver_id: dispatch.driver_id ?? null,
    driver: dispatch.driver ?? null,
    lr_number: dispatch.lr_number ?? null,
    transportation_cost:
      dispatch.transportation_cost != null
        ? parseFloat(dispatch.transportation_cost.toString())
        : null,
    distance_km: dispatch.distance_km != null ? parseFloat(dispatch.distance_km.toString()) : null,
    route_description: dispatch.route_description,
    usp: dispatch.usp ?? null,
    bilti_image_url: dispatch.bilti_image_url ?? null,
    bilti_pdf_url: dispatch.bilti_pdf_url ?? null,
    lr_image_url: dispatch.lr_image_url ?? null,
    lr_pdf_url: dispatch.lr_pdf_url ?? null,
    receiving_doc_image_url: dispatch.receiving_doc_image_url ?? null,
    receiving_doc_pdf_url: dispatch.receiving_doc_pdf_url ?? null,
    status: dispatch.status,
    bos_verification_token: dispatch.bos_verification_token ?? null,
    cancel_reason: dispatch.cancel_reason ?? null,
    document_compliance: buildDocumentCompliance(dispatch),
    created_at: dispatch.created_at instanceof Date ? dispatch.created_at.toISOString() : dispatch.created_at,
    updated_at: dispatch.updated_at instanceof Date ? dispatch.updated_at.toISOString() : dispatch.updated_at,
    lines: Array.isArray(dispatch.lines) ? dispatch.lines.map(formatLine) : [],
  };
}

export class InvoiceDispatchController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const salesSaudaId = req.query.sales_sauda_id as string | undefined;
      const godownId = req.query.godown_id as string | undefined;
      const status = req.query.status as 'draft' | 'confirmed' | 'cancelled' | undefined;
      const financialYear = req.query.financial_year as string | undefined;
      const search = parseSearchQuery(req.query);
      const { page, limit, offset } = parsePaginationQuery(req.query);
      const { items, total } = await invoiceDispatchService.list(
        salesSaudaId,
        status,
        godownId,
        financialYear,
        { limit, offset },
        search
      );
      return ResponseHandler.success(
        res,
        toPaginatedResult(
          items.map((d) => formatDispatch({ ...d, lines: [] })),
          total,
          page,
          limit
        )
      );
    } catch (error) {
      next(error);
    }
  }

  async getNextBillEligibility(
    _req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> {
    try {
      const eligibility = await invoiceDispatchService.getNextBillEligibility();
      return ResponseHandler.success(res, eligibility);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const dispatch = await invoiceDispatchService.getById(id);
      return ResponseHandler.success(res, formatDispatch(dispatch));
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const body = validate<{
        sales_sauda_id?: string;
        sales_sauda_ids?: string[];
        godown_id: string;
        to_godown_id?: string | null;
        dispatch_date?: string;
        transporter_id?: string;
        vehicle_id?: string;
        driver_id?: string;
        lr_number?: string | null;
        transportation_cost?: number | null;
        distance_km?: number;
        route_description?: string;
        usp?: string | null;
        lines?: Array<{
          sales_sauda_line_id: string;
          quantity?: number;
          packet_count?: number;
        }>;
      }>(createInvoiceDispatchSchema, req.body);
      const userId = req.user?.userId;
      const dispatch = await invoiceDispatchService.create(
        {
          sales_sauda_id: body.sales_sauda_id,
          sales_sauda_ids: body.sales_sauda_ids,
          godown_id: body.godown_id,
          to_godown_id: body.to_godown_id,
          dispatch_date: body.dispatch_date,
          transporter_id: body.transporter_id,
          vehicle_id: body.vehicle_id,
          driver_id: body.driver_id,
          lr_number: body.lr_number,
          transportation_cost: body.transportation_cost,
          distance_km: body.distance_km,
          route_description: body.route_description,
          usp: body.usp,
          lines: body.lines,
        },
        userId
      );
      return ResponseHandler.created(res, formatDispatch(dispatch), 'Invoice dispatch created successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const body = validate<{
        dispatch_date?: string | null;
        transporter_id?: string | null;
        vehicle_id?: string | null;
        driver_id?: string | null;
        lr_number?: string | null;
        transportation_cost?: number | null;
        distance_km?: number | null;
        route_description?: string | null;
        usp?: string | null;
      }>(updateInvoiceDispatchSchema, req.body);
      const dispatch = await invoiceDispatchService.update(id, body, req.user?.userId);
      return ResponseHandler.success(res, formatDispatch(dispatch), 'Invoice dispatch updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const userId = req.user?.userId;
      await invoiceDispatchService.delete(id, userId);
      return ResponseHandler.success(res, null, 'Invoice dispatch deleted successfully');
    } catch (error) {
      next(error);
    }
  }

  async confirm(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const userId = req.user?.userId;
      const dispatch = await invoiceDispatchService.confirm(id, userId);
      return ResponseHandler.success(res, formatDispatch(dispatch), 'Invoice dispatch confirmed successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /invoice-dispatches/:id/cancel
   * Body: { reason } — cancel confirmed sale or godown-transfer; restores stock.
   */
  async cancel(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const body = validate<{ reason: string }>(cancelInvoiceDispatchSchema, req.body ?? {});
      const userId = req.user?.userId;
      const dispatch = await invoiceDispatchService.cancel(id, body.reason, userId);
      return ResponseHandler.success(
        res,
        formatDispatch(dispatch),
        'Invoice dispatch cancelled and stock restored successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /invoice-dispatches/:id/upload-bilti
   * multipart field: file (image or PDF)
   */
  async uploadBilti(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      const existing = await invoiceDispatchDAO.findById(id);
      if (!existing) {
        throw new NotFoundError('Invoice dispatch not found');
      }

      if (!req.file) {
        throw new ValidationError('File is required');
      }

      validateFileSize(req.file.size, 10);
      validateFileType(req.file.mimetype, [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'application/pdf',
      ]);

      let uploadResult;
      try {
        uploadResult = await uploadToS3(
          req.file.buffer,
          req.file.originalname,
          appConfig.aws.s3.biltiFolder
        );
      } catch {
        throw new InternalServerError('Failed to upload bilti. Please try again.');
      }

      const extraction = await attemptLrExtraction(req.file);

      const isPdf = req.file.mimetype === 'application/pdf';
      const updateData: UpdateInvoiceDispatchDTO = {
        updated_by: req.user?.userId,
      };
      if (isPdf) {
        updateData.bilti_pdf_url = uploadResult.url;
      } else {
        updateData.bilti_image_url = uploadResult.url;
      }
      // Only prefill lr_number if it isn't already set — never clobber a value the user entered.
      if (extraction?.lr_number && !existing.lr_number) {
        updateData.lr_number = extraction.lr_number;
      }

      const dispatch = await invoiceDispatchDAO.update(id, updateData);
      if (!dispatch) {
        throw new NotFoundError('Invoice dispatch not found');
      }

      return ResponseHandler.success(
        res,
        {
          url: uploadResult.url,
          bilti_image_url: dispatch.bilti_image_url,
          bilti_pdf_url: dispatch.bilti_pdf_url,
          lr_number: dispatch.lr_number,
          extraction,
        },
        'Bilti uploaded successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /invoice-dispatches/:id/upload-lr
   * multipart field: file (image or PDF) — Lorry Receipt copy
   */
  async uploadLr(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      const existing = await invoiceDispatchDAO.findById(id);
      if (!existing) {
        throw new NotFoundError('Invoice dispatch not found');
      }

      if (!req.file) {
        throw new ValidationError('File is required');
      }

      validateFileSize(req.file.size, 10);
      validateFileType(req.file.mimetype, [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'application/pdf',
      ]);

      let uploadResult;
      try {
        uploadResult = await uploadToS3(
          req.file.buffer,
          req.file.originalname,
          appConfig.aws.s3.lrFolder
        );
      } catch {
        throw new InternalServerError('Failed to upload LR. Please try again.');
      }

      const extraction = await attemptLrExtraction(req.file);

      const isPdf = req.file.mimetype === 'application/pdf';
      const updateData: UpdateInvoiceDispatchDTO = {
        updated_by: req.user?.userId,
      };
      if (isPdf) {
        updateData.lr_pdf_url = uploadResult.url;
      } else {
        updateData.lr_image_url = uploadResult.url;
      }
      // Only prefill lr_number if it isn't already set — never clobber a value the user entered.
      if (extraction?.lr_number && !existing.lr_number) {
        updateData.lr_number = extraction.lr_number;
      }

      const dispatch = await invoiceDispatchDAO.update(id, updateData);
      if (!dispatch) {
        throw new NotFoundError('Invoice dispatch not found');
      }

      return ResponseHandler.success(
        res,
        {
          url: uploadResult.url,
          lr_image_url: dispatch.lr_image_url,
          lr_pdf_url: dispatch.lr_pdf_url,
          lr_number: dispatch.lr_number,
          extraction,
        },
        'LR uploaded successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /invoice-dispatches/extract-lr
   * multipart field: file (image of the LR/Bilty/GR receipt)
   *
   * Stateless — does not persist anything or require an existing dispatch. Used by the
   * frontend to prefill the LR number (and flag an unrecognised vehicle) before/while
   * creating a dispatch, i.e. before there's a dispatch id to attach a document to.
   * Once a dispatch exists, POST /:id/upload-bilti and POST /:id/upload-lr persist the
   * document AND run this same extraction (see attemptLrExtraction below).
   */
  async extractLr(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!appConfig.openai.lrExtractionEnabled) {
        throw new ValidationError('LR extraction is currently disabled');
      }

      if (!req.file) {
        throw new ValidationError('File is required');
      }

      validateFileSize(req.file.size, 5);
      validateFileType(req.file.mimetype, LR_EXTRACTION_IMAGE_MIME_TYPES);

      let extraction;
      try {
        extraction = await lrExtractionService.extractLrDetailsFromImage(
          req.file.buffer,
          req.file.mimetype
        );
      } catch {
        throw new InternalServerError('Failed to extract details from the LR/Bilty image. Please try again.');
      }

      return ResponseHandler.success(res, extraction, 'LR/Bilty details extracted successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /invoice-dispatches/:id/upload-receiving-doc
   * multipart field: file (image or PDF)
   */
  async uploadReceivingDoc(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      const existing = await invoiceDispatchDAO.findById(id);
      if (!existing) {
        throw new NotFoundError('Invoice dispatch not found');
      }

      if (!req.file) {
        throw new ValidationError('File is required');
      }

      validateFileSize(req.file.size, 10);
      validateFileType(req.file.mimetype, [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'application/pdf',
      ]);

      let uploadResult;
      try {
        uploadResult = await uploadToS3(
          req.file.buffer,
          req.file.originalname,
          appConfig.aws.s3.receivingDocFolder
        );
      } catch {
        throw new InternalServerError('Failed to upload receiving document. Please try again.');
      }

      const isPdf = req.file.mimetype === 'application/pdf';
      const updateData: UpdateInvoiceDispatchDTO = {
        updated_by: req.user?.userId,
      };
      if (isPdf) {
        updateData.receiving_doc_pdf_url = uploadResult.url;
      } else {
        updateData.receiving_doc_image_url = uploadResult.url;
      }

      const dispatch = await invoiceDispatchDAO.update(id, updateData);
      if (!dispatch) {
        throw new NotFoundError('Invoice dispatch not found');
      }

      return ResponseHandler.success(
        res,
        {
          url: uploadResult.url,
          receiving_doc_image_url: dispatch.receiving_doc_image_url,
          receiving_doc_pdf_url: dispatch.receiving_doc_pdf_url,
        },
        'Receiving document uploaded successfully'
      );
    } catch (error) {
      next(error);
    }
  }
}

export const invoiceDispatchController = new InvoiceDispatchController();
