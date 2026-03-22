import { Response, NextFunction } from 'express';
import { invoiceDispatchService } from '../services/invoice-dispatch.service';
import { ResponseHandler } from '../utils/response';
import { validate, createInvoiceDispatchSchema, uuidSchema } from '../utils/validators';
import { AuthRequest } from '../middleware/auth.middleware';
import { InvoiceDispatchLine } from '../models/invoice-dispatch-line.model';

function formatLine(line: InvoiceDispatchLine) {
  return {
    id: line.id,
    invoice_dispatch_id: line.invoice_dispatch_id,
    sales_sauda_line_id: line.sales_sauda_line_id,
    product_id: line.product_id,
    packaging_id: line.packaging_id,
    quantity: parseFloat(line.quantity.toString()),
    quantity_unit: line.quantity_unit,
    rate: parseFloat(line.rate.toString()),
    amount: parseFloat(line.amount.toString()),
    created_at: line.created_at instanceof Date ? line.created_at.toISOString() : line.created_at,
    updated_at: line.updated_at instanceof Date ? line.updated_at.toISOString() : line.updated_at,
  };
}

function formatDispatch(dispatch: any) {
  return {
    id: dispatch.id,
    sales_sauda_id: dispatch.sales_sauda_id,
    godown_id: dispatch.godown_id,
    internal_invoice_number: dispatch.internal_invoice_number,
    dispatch_date: typeof dispatch.dispatch_date === 'string' ? dispatch.dispatch_date : dispatch.dispatch_date?.toISOString?.()?.split('T')[0] ?? null,
    party_name: dispatch.party_name,
    party_address: dispatch.party_address,
    party_gst_number: dispatch.party_gst_number,
    party_pan_number: dispatch.party_pan_number,
    transporter_id: dispatch.transporter_id,
    vehicle_id: dispatch.vehicle_id,
    distance_km: dispatch.distance_km != null ? parseFloat(dispatch.distance_km.toString()) : null,
    route_description: dispatch.route_description,
    status: dispatch.status,
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
      const status = req.query.status as 'draft' | 'confirmed' | undefined;
      const list = await invoiceDispatchService.list(salesSaudaId, status, godownId);
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
      const body = validate<{ sales_sauda_id: string; godown_id: string; internal_invoice_number: string; dispatch_date?: string; transporter_id?: string; vehicle_id?: string; distance_km?: number; route_description?: string }>(createInvoiceDispatchSchema, req.body);
      const userId = req.user?.userId;
      const dispatch = await invoiceDispatchService.create(
        {
          sales_sauda_id: body.sales_sauda_id,
          godown_id: body.godown_id,
          internal_invoice_number: body.internal_invoice_number,
          dispatch_date: body.dispatch_date,
          transporter_id: body.transporter_id,
          vehicle_id: body.vehicle_id,
          distance_km: body.distance_km,
          route_description: body.route_description,
        },
        userId
      );
      return ResponseHandler.created(res, formatDispatch(dispatch), 'Invoice dispatch created successfully');
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
}

export const invoiceDispatchController = new InvoiceDispatchController();
