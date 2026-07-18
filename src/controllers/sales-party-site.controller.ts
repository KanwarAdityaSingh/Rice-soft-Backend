import { Response, NextFunction } from 'express';
import { salesPartySiteDAO } from '../dao/sales-party-site.dao';
import { salesPartyDAO } from '../dao/sales-party.dao';
import { ResponseHandler } from '../utils/response';
import {
  validate,
  createSalesPartySiteSchema,
  updateSalesPartySiteSchema,
  uuidSchema,
} from '../utils/validators';
import { NotFoundError, ValidationError } from '../utils/errors';
import {
  CreateSalesPartySiteDTO,
  UpdateSalesPartySiteDTO,
  SalesPartySiteResponse,
} from '../models/sales-party-site.model';
import { AuthRequest } from '../middleware/auth.middleware';

function toResponse(site: {
  id: string;
  sales_party_id: string;
  name: string | null;
  address: unknown;
  google_location_link: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}): SalesPartySiteResponse {
  return {
    id: site.id,
    sales_party_id: site.sales_party_id,
    name: site.name,
    address: site.address as SalesPartySiteResponse['address'],
    google_location_link: site.google_location_link,
    is_active: site.is_active,
    created_at: site.created_at.toISOString(),
    updated_at: site.updated_at.toISOString(),
  };
}

export class SalesPartySiteController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const salesPartyIdRaw = req.query.sales_party_id as string | undefined;
      if (!salesPartyIdRaw) {
        throw new ValidationError('sales_party_id query parameter is required');
      }
      const salesPartyId = validate<string>(uuidSchema, salesPartyIdRaw);
      const includeInactive = req.query.include_inactive === 'true';

      const party = await salesPartyDAO.findById(salesPartyId);
      if (!party) {
        throw new NotFoundError('Sales party not found');
      }

      const sites = await salesPartySiteDAO.findBySalesPartyId(salesPartyId, includeInactive);
      return ResponseHandler.success(res, sites.map(toResponse));
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const site = await salesPartySiteDAO.findById(id);
      if (!site) {
        throw new NotFoundError('Site not found');
      }
      return ResponseHandler.success(res, toResponse(site));
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const body = validate<CreateSalesPartySiteDTO>(createSalesPartySiteSchema, req.body);

      const party = await salesPartyDAO.findById(body.sales_party_id);
      if (!party) {
        throw new NotFoundError('Sales party not found');
      }

      if (req.user) {
        body.created_by = req.user.userId;
      }

      const created = await salesPartySiteDAO.create(body);
      return ResponseHandler.created(res, toResponse(created), 'Site created successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const body = validate<UpdateSalesPartySiteDTO>(updateSalesPartySiteSchema, req.body);

      const existing = await salesPartySiteDAO.findById(id);
      if (!existing) {
        throw new NotFoundError('Site not found');
      }

      if (req.user) {
        body.updated_by = req.user.userId;
      }

      const updated = await salesPartySiteDAO.update(id, body);
      if (!updated) {
        throw new NotFoundError('Site not found');
      }
      return ResponseHandler.success(res, toResponse(updated), 'Site updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      const existing = await salesPartySiteDAO.findById(id);
      if (!existing) {
        throw new NotFoundError('Site not found');
      }

      await salesPartySiteDAO.delete(id);
      return ResponseHandler.success(res, { id }, 'Site deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const salesPartySiteController = new SalesPartySiteController();
