import { Response, NextFunction } from 'express';
import { salesSaudaService } from '../services/sales-sauda.service';
import { ResponseHandler } from '../utils/response';
import { validate, createSalesSaudaSchema, updateSalesSaudaSchema, uuidSchema } from '../utils/validators';
import { AuthRequest } from '../middleware/auth.middleware';
import { SalesSaudaStatus, SalesSaudaType, SalesMovementType } from '../models/sales-sauda.model';
import type { Address } from '../models/vendor.model';
import { formatSaudaDisplayId } from '../utils/sauda-display';
import { SalesSaudaLine } from '../models/sales-sauda-line.model';
import { SALES_SAUDA_TYPE_OPTIONS } from '../constants/sales-sauda-types';

function formatLine(line: SalesSaudaLine & {
  ordered?: number;
  allocated?: number;
  returned?: number;
  remaining?: number;
}) {
  const quantity = parseFloat(line.quantity.toString());
  return {
    id: line.id,
    sales_sauda_id: line.sales_sauda_id,
    product_id: line.product_id,
    packaging_id: line.packaging_id,
    packet_count: line.packet_count != null ? parseInt(line.packet_count.toString(), 10) : null,
    quantity,
    quantity_unit: line.quantity_unit,
    rate: parseFloat(line.rate.toString()),
    discount_value: parseFloat(line.discount_value.toString()),
    discount_type: line.discount_type,
    gst_percent: parseFloat(line.gst_percent.toString()),
    amount: parseFloat(line.amount.toString()),
    discount_amount: parseFloat(line.discount_amount.toString()),
    gst_amount: parseFloat(line.gst_amount.toString()),
    final_amount: parseFloat(line.final_amount.toString()),
    sort_order: line.sort_order,
    ordered: line.ordered != null ? parseFloat(line.ordered.toString()) : quantity,
    allocated: line.allocated != null ? parseFloat(line.allocated.toString()) : 0,
    returned: line.returned != null ? parseFloat(line.returned.toString()) : 0,
    remaining:
      line.remaining != null
        ? parseFloat(line.remaining.toString())
        : quantity,
    created_at: line.created_at instanceof Date ? line.created_at.toISOString() : line.created_at,
    updated_at: line.updated_at instanceof Date ? line.updated_at.toISOString() : line.updated_at,
  };
}

function formatSauda(sauda: any) {
  return {
    id: sauda.id,
    display_id: formatSaudaDisplayId(sauda.id),
    sales_party_id: sauda.sales_party_id,
    salesman_id: sauda.salesman_id ?? null,
    salesman_name: sauda.salesman_name ?? null,
    salesman_commission_type: sauda.salesman_commission_type ?? null,
    salesman_commission_config: sauda.salesman_commission_config ?? null,
    salesman_commission_preview:
      sauda.salesman_commission_preview != null
        ? Number(sauda.salesman_commission_preview)
        : null,
    sauda_type: sauda.sauda_type ?? null,
    movement_type: sauda.movement_type ?? 'sale',
    from_godown_id: sauda.from_godown_id ?? null,
    to_godown_id: sauda.to_godown_id ?? null,
    status: sauda.status,
    order_number: sauda.order_number,
    sauda_date: typeof sauda.sauda_date === 'string' ? sauda.sauda_date : (sauda.sauda_date?.toISOString?.()?.split('T')[0] ?? null),
    financial_year: sauda.financial_year,
    billing_address: sauda.billing_address ?? null,
    delivery_address: sauda.delivery_address ?? null,
    notes: sauda.notes,
    payment_terms: sauda.payment_terms != null ? parseInt(sauda.payment_terms.toString(), 10) : null,
    amount: sauda.amount != null ? parseFloat(sauda.amount.toString()) : 0,
    created_at: sauda.created_at instanceof Date ? sauda.created_at.toISOString() : sauda.created_at,
    updated_at: sauda.updated_at instanceof Date ? sauda.updated_at.toISOString() : sauda.updated_at,
    lines: Array.isArray(sauda.lines) ? sauda.lines.map(formatLine) : undefined,
  };
}

export class SalesSaudaController {
  async getTypes(_req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      return ResponseHandler.success(res, SALES_SAUDA_TYPE_OPTIONS);
    } catch (error) {
      next(error);
    }
  }

  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const salesPartyId = req.query.sales_party_id as string | undefined;
      const status = (req.query.status as string | undefined) as SalesSaudaStatus | undefined;
      const financialYear = req.query.financial_year as string | undefined;
      const movementRaw = req.query.movement_type as string | undefined;
      let movementType: SalesMovementType | 'all' | undefined;
      if (movementRaw === 'all' || movementRaw === 'sale' || movementRaw === 'godown_transfer') {
        movementType = movementRaw;
      }
      const list = await salesSaudaService.list(salesPartyId, status, financialYear, movementType);
      const data = list.map((s) => formatSauda({ ...s, lines: [] }));
      return ResponseHandler.success(res, data);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const sauda = await salesSaudaService.getById(id);
      return ResponseHandler.success(res, formatSauda(sauda));
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const body = validate<{
        sales_party_id?: string;
        salesman_id?: string | null;
        salesman_commission_type?: string | null;
        salesman_commission_config?: Record<string, unknown> | null;
        sauda_type: SalesSaudaType;
        movement_type?: SalesMovementType;
        from_godown_id?: string | null;
        to_godown_id?: string | null;
        status?: string;
        sauda_date?: string;
        billing_address?: Address | null;
        delivery_address?: Address | null;
        notes?: string;
        payment_terms?: number | null;
        lines?: Array<{
          product_id: string;
          packaging_id?: string;
          packet_count?: number;
          quantity?: number;
          quantity_unit?: string;
          rate: number;
          discount_value?: number;
          discount_type?: 'per_kg' | 'percentage';
          gst_percent?: number;
          sort_order?: number;
        }>;
      }>(createSalesSaudaSchema, req.body);
      const userId = req.user?.userId;
      const sauda = await salesSaudaService.create(
        {
          sales_party_id: body.sales_party_id,
          salesman_id: body.salesman_id,
          salesman_commission_type: body.salesman_commission_type as any,
          salesman_commission_config: body.salesman_commission_config as any,
          sauda_type: body.sauda_type,
          movement_type: body.movement_type,
          from_godown_id: body.from_godown_id,
          to_godown_id: body.to_godown_id,
          status: body.status as SalesSaudaStatus | undefined,
          sauda_date: body.sauda_date,
          billing_address: body.billing_address,
          delivery_address: body.delivery_address,
          notes: body.notes,
          payment_terms: body.payment_terms,
          lines: body.lines,
        },
        userId
      );
      return ResponseHandler.created(res, formatSauda(sauda), 'Sales sauda created successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const body = validate<{
        sales_party_id?: string;
        salesman_id?: string | null;
        salesman_commission_type?: string | null;
        salesman_commission_config?: Record<string, unknown> | null;
        sauda_type?: SalesSaudaType;
        movement_type?: SalesMovementType;
        from_godown_id?: string | null;
        to_godown_id?: string | null;
        status?: string;
        sauda_date?: string;
        billing_address?: Address | null;
        delivery_address?: Address | null;
        notes?: string;
        payment_terms?: number | null;
        lines?: Array<{
          product_id: string;
          packaging_id?: string;
          packet_count?: number;
          quantity?: number;
          quantity_unit?: string;
          rate: number;
          discount_value?: number;
          discount_type?: 'per_kg' | 'percentage';
          gst_percent?: number;
          sort_order?: number;
        }>;
      }>(updateSalesSaudaSchema, req.body);
      const userId = req.user?.userId;
      const sauda = await salesSaudaService.update(
        id,
        {
          sales_party_id: body.sales_party_id,
          salesman_id: body.salesman_id,
          salesman_commission_type: body.salesman_commission_type as any,
          salesman_commission_config: body.salesman_commission_config as any,
          sauda_type: body.sauda_type,
          movement_type: body.movement_type,
          from_godown_id: body.from_godown_id,
          to_godown_id: body.to_godown_id,
          status: body.status as SalesSaudaStatus | undefined,
          sauda_date: body.sauda_date,
          billing_address: body.billing_address,
          delivery_address: body.delivery_address,
          notes: body.notes,
          payment_terms: body.payment_terms,
          lines: body.lines,
          updated_by: userId,
        },
        userId
      );
      return ResponseHandler.success(res, formatSauda(sauda), 'Sales sauda updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async finalize(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const userId = req.user?.userId;
      const sauda = await salesSaudaService.finalize(id, userId);
      return ResponseHandler.success(res, formatSauda(sauda), 'Sales sauda finalized successfully');
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      await salesSaudaService.delete(id);
      return ResponseHandler.success(res, null, 'Sales sauda deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const salesSaudaController = new SalesSaudaController();
