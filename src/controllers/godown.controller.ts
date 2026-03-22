import { Response, NextFunction } from 'express';
import { ResponseHandler } from '../utils/response';
import { validate, createGodownSchema, updateGodownSchema, uuidSchema } from '../utils/validators';
import { AuthRequest } from '../middleware/auth.middleware';
import { godownService } from '../services/godown.service';
import { gstLookupService } from '../services/gst-lookup.service';
import { ValidationError } from '../utils/errors';
import type { CreateGodownDTO, UpdateGodownDTO, Godown } from '../models/godown.model';

/** Avoid Joi's opaque `"value" must be a valid GUID` when :id is mistaken for a route like lookupGST. */
function parseGodownIdParam(raw: string | undefined): string {
  if (!raw) {
    throw new ValidationError('Godown id is required');
  }
  try {
    return validate<string>(uuidSchema, raw);
  } catch {
    throw new ValidationError(
      'Invalid godown id. For GSTIN lookup use GET /api/v1/godowns/lookupGST?gst_number=<GSTIN>.'
    );
  }
}

function toResponse(godown: Godown) {
  return {
    id: godown.id,
    name: godown.name,
    gst_number: godown.gst_number,
    address: godown.address,
    google_maps_link: godown.google_maps_link,
    contact_persons: godown.contact_persons,
    is_active: godown.is_active,
    created_at: godown.created_at instanceof Date ? godown.created_at.toISOString() : godown.created_at,
    updated_at: godown.updated_at instanceof Date ? godown.updated_at.toISOString() : godown.updated_at,
  };
}

export class GodownController {
  /**
   * Lookup GSTIN via MastersIndia (same contract as GET /vendors/lookupGST).
   */
  async lookupGST(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const gstNumber = req.query.gst_number as string;

      if (!gstNumber) {
        throw new ValidationError('GST number is required');
      }

      if (!gstLookupService.validateGSTFormat(gstNumber)) {
        throw new ValidationError('Invalid GST number format. Expected format: 27ABCDE1234F1Z5');
      }

      const gstData = await gstLookupService.lookupGST(gstNumber);
      const mappedData = gstLookupService.mapGSTToBusinessData(gstData);

      return ResponseHandler.success(res, {
        gst_data: gstData,
        mapped_data: mappedData,
      }, 'GST details fetched successfully');
    } catch (error) {
      next(error);
    }
  }

  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const includeInactive = req.query.include_inactive === 'true';
      const list = await godownService.list(includeInactive);
      return ResponseHandler.success(res, list.map(toResponse));
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = parseGodownIdParam(req.params.id);
      const godown = await godownService.getById(id);
      return ResponseHandler.success(res, toResponse(godown));
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const data = validate<CreateGodownDTO>(createGodownSchema, req.body);
      const created = await godownService.create({
        ...data,
        created_by: req.user?.userId,
      });
      return ResponseHandler.created(res, toResponse(created), 'Godown created successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = parseGodownIdParam(req.params.id);
      const data = validate<UpdateGodownDTO>(updateGodownSchema, req.body);
      const updated = await godownService.update(id, {
        ...data,
        updated_by: req.user?.userId,
      });
      return ResponseHandler.success(res, toResponse(updated), 'Godown updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = parseGodownIdParam(req.params.id);
      await godownService.delete(id);
      return ResponseHandler.success(res, null, 'Godown deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const godownController = new GodownController();
