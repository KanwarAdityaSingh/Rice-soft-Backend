import { Response, NextFunction } from 'express';
import { ResponseHandler } from '../utils/response';
import { validate, createSalesPartySchema, updateSalesPartySchema, uuidSchema } from '../utils/validators';
import {
  CreateSalesPartyDTO,
  UpdateSalesPartyDTO,
  SalesPartyResponse,
  SalesParty,
  SalesPartyRegistrationType,
} from '../models/sales-party.model';
import { AuthRequest } from '../middleware/auth.middleware';
import { salesPartyService } from '../services/sales-party.service';
import { ValidationError } from '../utils/errors';
import { parseEntityKycDetails } from '../utils/kyc-verification';

function toResponse(party: SalesParty): SalesPartyResponse {
  return {
    id: party.id,
    business_name: party.business_name,
    contact_persons: party.contact_persons,
    address: party.address,
    business_details: party.business_details,
    aadhar_number: party.aadhar_number ?? null,
    registration_type: party.registration_type,
    bank_details: party.bank_details,
    is_active: party.is_active,
    is_verified: party.is_verified,
    verified_at: party.verified_at?.toISOString() ?? null,
    user_id: party.user_id,
    lead_id: party.lead_id ?? null,
    created_at: party.created_at instanceof Date ? party.created_at.toISOString() : party.created_at,
    updated_at: party.updated_at instanceof Date ? party.updated_at.toISOString() : party.updated_at,
    last_enquiry_date: party.last_enquiry_date?.toISOString() ?? null,
    google_location_link: party.google_location_link,
    business_card_url: party.business_card_url,
    kyc_verification_details: parseEntityKycDetails(party.kyc_verification_details),
  };
}

function assertSalesPartyRegistrationFields(
  registrationType: SalesPartyRegistrationType,
  businessDetails: CreateSalesPartyDTO['business_details'],
  aadharNumber?: string | null
): void {
  if (registrationType === 'registered') {
    const hasGst = Boolean(businessDetails.gst_number?.trim());
    const hasPan = Boolean(businessDetails.pan_number?.trim());
    if (!hasGst && !hasPan) {
      throw new ValidationError('Registered sales parties require GST or PAN in business_details');
    }
    return;
  }

  if (!aadharNumber?.trim()) {
    throw new ValidationError('Unregistered sales parties require aadhar_number');
  }
}

function assertSalesPartyRegistrationOnUpdate(existing: SalesParty, update: UpdateSalesPartyDTO): void {
  const registrationType = update.registration_type ?? existing.registration_type;
  const businessDetails = {
    ...existing.business_details,
    ...update.business_details,
  };
  const aadharNumber =
    update.aadhar_number !== undefined ? update.aadhar_number : existing.aadhar_number;

  assertSalesPartyRegistrationFields(registrationType, businessDetails, aadharNumber);
}

export class SalesPartyController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const includeInactive = req.query.include_inactive === 'true';

      let isVerified: boolean | undefined;
      if (req.query.is_verified === 'true') {
        isVerified = true;
      } else if (req.query.is_verified === 'false') {
        isVerified = false;
      }

      const registrationType = req.query.registration_type as SalesPartyRegistrationType | undefined;
      if (
        registrationType &&
        registrationType !== 'registered' &&
        registrationType !== 'unregistered'
      ) {
        throw new ValidationError('registration_type must be registered or unregistered');
      }

      const list = await salesPartyService.list({
        includeInactive,
        isVerified,
        registrationType,
      });
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
      assertSalesPartyRegistrationFields(
        data.registration_type,
        data.business_details,
        data.aadhar_number
      );
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
      const existing = await salesPartyService.getById(id);
      assertSalesPartyRegistrationOnUpdate(existing, data);
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
