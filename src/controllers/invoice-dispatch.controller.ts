import { Response, NextFunction } from 'express';
import { invoiceDispatchService } from '../services/invoice-dispatch.service';
import { invoiceDispatchDAO } from '../dao/invoice-dispatch.dao';
import { ResponseHandler } from '../utils/response';
import {
  validate,
  createInvoiceDispatchSchema,
  updateInvoiceDispatchSchema,
  cancelInvoiceDispatchSchema,
  uuidSchema,
} from '../utils/validators';
import { AuthRequest } from '../middleware/auth.middleware';
import { InvoiceDispatchLine } from '../models/invoice-dispatch-line.model';
import { UpdateInvoiceDispatchDTO } from '../models/invoice-dispatch.model';
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

function formatLine(line: InvoiceDispatchLine) {
  return {
    id: line.id,
    invoice_dispatch_id: line.invoice_dispatch_id,
    sales_sauda_line_id: line.sales_sauda_line_id,
    product_id: line.product_id,
    packaging_id: line.packaging_id,
    packet_count:
      line.packet_count != null ? parseInt(line.packet_count.toString(), 10) : null,
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
    internal_invoice_number: dispatch.internal_invoice_number,
    dispatch_date: typeof dispatch.dispatch_date === 'string' ? dispatch.dispatch_date : dispatch.dispatch_date?.toISOString?.()?.split('T')[0] ?? null,
    financial_year: dispatch.financial_year,
    party_name: dispatch.party_name,
    party_address: dispatch.party_address,
    party_gst_number: dispatch.party_gst_number,
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
    cancel_reason: dispatch.cancel_reason ?? null,
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
      const list = await invoiceDispatchService.list(salesSaudaId, status, godownId, financialYear);
      const data = list.map((d) => formatDispatch({ ...d, lines: [] }));
      return ResponseHandler.success(res, data);
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

      const isPdf = req.file.mimetype === 'application/pdf';
      const updateData: UpdateInvoiceDispatchDTO = {
        updated_by: req.user?.userId,
      };
      if (isPdf) {
        updateData.bilti_pdf_url = uploadResult.url;
      } else {
        updateData.bilti_image_url = uploadResult.url;
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

      const isPdf = req.file.mimetype === 'application/pdf';
      const updateData: UpdateInvoiceDispatchDTO = {
        updated_by: req.user?.userId,
      };
      if (isPdf) {
        updateData.lr_pdf_url = uploadResult.url;
      } else {
        updateData.lr_image_url = uploadResult.url;
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
        },
        'LR uploaded successfully'
      );
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
