import { Response, NextFunction } from 'express';
import { vendorSiteDAO } from '../dao/vendor-site.dao';
import { vendorDAO } from '../dao/vendor.dao';
import { ResponseHandler } from '../utils/response';
import {
  validate,
  createVendorSiteSchema,
  updateVendorSiteSchema,
  uuidSchema,
} from '../utils/validators';
import { NotFoundError, ValidationError } from '../utils/errors';
import {
  CreateVendorSiteDTO,
  UpdateVendorSiteDTO,
  VendorSiteResponse,
} from '../models/vendor-site.model';
import { AuthRequest } from '../middleware/auth.middleware';

function toResponse(site: {
  id: string;
  vendor_id: string;
  name: string | null;
  address: unknown;
  google_location_link: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}): VendorSiteResponse {
  return {
    id: site.id,
    vendor_id: site.vendor_id,
    name: site.name,
    address: site.address as VendorSiteResponse['address'],
    google_location_link: site.google_location_link,
    is_active: site.is_active,
    created_at: site.created_at.toISOString(),
    updated_at: site.updated_at.toISOString(),
  };
}

export class VendorSiteController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const vendorIdRaw = req.query.vendor_id as string | undefined;
      if (!vendorIdRaw) {
        throw new ValidationError('vendor_id query parameter is required');
      }
      const vendorId = validate<string>(uuidSchema, vendorIdRaw);
      const includeInactive = req.query.include_inactive === 'true';

      const vendor = await vendorDAO.findById(vendorId);
      if (!vendor) {
        throw new NotFoundError('Vendor not found');
      }

      const sites = await vendorSiteDAO.findByVendorId(vendorId, includeInactive);
      return ResponseHandler.success(res, sites.map(toResponse));
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const site = await vendorSiteDAO.findById(id);
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
      const body = validate<CreateVendorSiteDTO>(createVendorSiteSchema, req.body);

      const vendor = await vendorDAO.findById(body.vendor_id);
      if (!vendor) {
        throw new NotFoundError('Vendor not found');
      }

      if (req.user) {
        body.created_by = req.user.userId;
      }

      const created = await vendorSiteDAO.create(body);
      return ResponseHandler.created(res, toResponse(created), 'Site created successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const body = validate<UpdateVendorSiteDTO>(updateVendorSiteSchema, req.body);

      const existing = await vendorSiteDAO.findById(id);
      if (!existing) {
        throw new NotFoundError('Site not found');
      }

      if (req.user) {
        body.updated_by = req.user.userId;
      }

      const updated = await vendorSiteDAO.update(id, body);
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

      const existing = await vendorSiteDAO.findById(id);
      if (!existing) {
        throw new NotFoundError('Site not found');
      }

      await vendorSiteDAO.softDelete(id);
      return ResponseHandler.success(res, { id }, 'Site deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const vendorSiteController = new VendorSiteController();
