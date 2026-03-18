import { Response, NextFunction } from 'express';
import { ResponseHandler } from '../utils/response';
import { validate, createSalesPartySchema, updateSalesPartySchema, uuidSchema } from '../utils/validators';
import {
  CreateSalesPartyDTO,
  UpdateSalesPartyDTO,
  SalesPartyResponse,
} from '../models/sales-party.model';
import { AuthRequest } from '../middleware/auth.middleware';
import { salesPartyService } from '../services/sales-party.service';

function toResponse(party: {
  id: string;
  business_name: string;
  contact_persons: any;
  address: any;
  business_details: any;
  bank_details: any;
  is_active: boolean;
  user_id: string | null;
  lead_id: string | null;
  created_at: Date;
  updated_at: Date;
  last_enquiry_date: Date | null;
  google_location_link: string | null;
  business_card_url: string | null;
}): SalesPartyResponse {
  return {
    id: party.id,
    business_name: party.business_name,
    contact_persons: party.contact_persons,
    address: party.address,
    business_details: party.business_details,
    bank_details: party.bank_details,
    is_active: party.is_active,
    user_id: party.user_id,
    lead_id: party.lead_id ?? null,
    created_at: party.created_at instanceof Date ? party.created_at.toISOString() : party.created_at,
    updated_at: party.updated_at instanceof Date ? party.updated_at.toISOString() : party.updated_at,
    last_enquiry_date: party.last_enquiry_date?.toISOString() ?? null,
    google_location_link: party.google_location_link,
    business_card_url: party.business_card_url,
  };
}

export class SalesPartyController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const includeInactive = req.query.include_inactive === 'true';
      const list = await salesPartyService.list(includeInactive);
      return ResponseHandler.success(res, list.map(toResponse));
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const party = await salesPartyService.getById(id);
      return ResponseHandler.success(res, toResponse(party));
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const data = validate<CreateSalesPartyDTO>(createSalesPartySchema, req.body);
      const created = await salesPartyService.create({
        ...data,
        created_by: req.user?.userId,
      });
      return ResponseHandler.created(res, toResponse(created), 'Sales party created successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const data = validate<UpdateSalesPartyDTO>(updateSalesPartySchema, req.body);
      const updated = await salesPartyService.update(id, {
        ...data,
        updated_by: req.user?.userId,
      });
      return ResponseHandler.success(res, toResponse(updated), 'Sales party updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      await salesPartyService.delete(id);
      return ResponseHandler.success(res, null, 'Sales party deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const salesPartyController = new SalesPartyController();
