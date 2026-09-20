import { Response, NextFunction } from 'express';
import { packagingVendorService } from '../services/packaging-vendor.service';
import { ResponseHandler } from '../utils/response';
import {
  validate,
  uuidSchema,
  createMasterVendorSchema,
  updateMasterVendorSchema,
} from '../utils/validators';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  CreateMasterVendorDTO,
  UpdateMasterVendorDTO,
  MasterVendorResponse,
  MasterVendor,
  MasterVendorRegistrationType,
  MasterVendorStatus,
} from '../models/packaging-vendor.model';
import { gstLookupService } from '../services/gst-lookup.service';
import { ValidationError, NotFoundError, InternalServerError } from '../utils/errors';
import { parseEntityKycDetails } from '../utils/kyc-verification';
import { parsePaginationQuery, toPaginatedResult } from '../utils/pagination';
import { parseSearchQuery } from '../utils/search';

const REGISTRATION_TYPES: MasterVendorRegistrationType[] = [
  'registered',
  'unregistered',
  'consumer',
];

const STATUSES: MasterVendorStatus[] = ['active', 'inactive', 'blacklisted'];

function parseMasterVendorIdParam(raw: string | undefined): string {
  if (!raw) {
    throw new ValidationError('Master vendor id is required');
  }
  try {
    return validate<string>(uuidSchema, raw);
  } catch {
    throw new ValidationError(
      'Invalid master vendor id. For GSTIN lookup use GET /api/v1/master-vendors/lookupGST?gst_number=<GSTIN>.'
    );
  }
}

function toResponse(vendor: MasterVendor): MasterVendorResponse {
  const gst =
    vendor.business_details?.gst_number?.trim() || vendor.gst_number || null;
  return {
    id: vendor.id,
    business_name: vendor.business_name,
    name: vendor.business_name,
    contact_persons: vendor.contact_persons,
    address: vendor.address,
    gst_number: gst,
    business_details: vendor.business_details,
    bank_details: vendor.bank_details,
    registration_type: vendor.registration_type,
    status: vendor.status,
    is_active: vendor.is_active,
    is_verified: vendor.is_verified,
    verified_at: vendor.verified_at
      ? vendor.verified_at instanceof Date
        ? vendor.verified_at.toISOString()
        : String(vendor.verified_at)
      : null,
    kyc_verification_details: parseEntityKycDetails(vendor.kyc_verification_details),
    credit_period_days: vendor.credit_period_days,
    credit_limit: vendor.credit_limit,
    opening_balance: vendor.opening_balance,
    address_locked: vendor.address_locked,
    google_location_link: vendor.google_location_link,
    created_at:
      vendor.created_at instanceof Date
        ? vendor.created_at.toISOString()
        : String(vendor.created_at),
    updated_at:
      vendor.updated_at instanceof Date
        ? vendor.updated_at.toISOString()
        : String(vendor.updated_at),
  };
}

function assertMasterVendorRegistrationFields(
  registrationType: MasterVendorRegistrationType,
  businessDetails: CreateMasterVendorDTO['business_details'],
  gstNumber?: string | null
): void {
  const hasPan = Boolean(businessDetails?.pan_number?.trim());
  const hasGst = Boolean(businessDetails?.gst_number?.trim() || gstNumber?.trim());

  if (registrationType === 'consumer') return;

  if (registrationType === 'unregistered') {
    if (!hasPan) {
      throw new ValidationError('Unregistered master vendors require PAN in business_details');
    }
    return;
  }

  if (!hasGst || !hasPan) {
    throw new ValidationError(
      'Registered master vendors require both GST and PAN in business_details'
    );
  }
}

export class PackagingVendorController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const includeInactive = req.query.include_inactive === 'true';

      let isVerified: boolean | undefined;
      if (req.query.is_verified === 'true') isVerified = true;
      else if (req.query.is_verified === 'false') isVerified = false;

      const registrationType = req.query.registration_type as
        | MasterVendorRegistrationType
        | undefined;
      if (registrationType && !REGISTRATION_TYPES.includes(registrationType)) {
        throw new ValidationError(
          'registration_type must be registered, unregistered, or consumer'
        );
      }

      const status = req.query.status as MasterVendorStatus | undefined;
      if (status && !STATUSES.includes(status)) {
        throw new ValidationError('status must be active, inactive, or blacklisted');
      }

      const search = parseSearchQuery(req.query);
      const { page, limit, offset } = parsePaginationQuery(req.query);

      const { items, total } = await packagingVendorService.list(
        {
          includeInactive,
          isVerified,
          registrationType,
          status,
          search,
        },
        { limit, offset }
      );
      return ResponseHandler.success(
        res,
        toPaginatedResult(items.map(toResponse), total, page, limit)
      );
    } catch (error) {
      next(error);
    }
  }

  /** Name typeahead — prevents duplicate master vendor creation */
  async suggest(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const q = parseSearchQuery(req.query) ?? '';
      if (!q) {
        return ResponseHandler.success(res, []);
      }
      const limitRaw = req.query.limit ? Number(req.query.limit) : 10;
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 10;
      const list = await packagingVendorService.suggest(q, limit);
      return ResponseHandler.success(res, list.map(toResponse));
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = parseMasterVendorIdParam(req.params.id);
      const vendor = await packagingVendorService.getById(id);
      return ResponseHandler.success(res, toResponse(vendor));
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const data = validate<CreateMasterVendorDTO>(createMasterVendorSchema, req.body);
      assertMasterVendorRegistrationFields(
        data.registration_type,
        data.business_details,
        data.gst_number
      );
      const created = await packagingVendorService.create({
        ...data,
        created_by: req.user?.userId,
      });
      return ResponseHandler.created(res, toResponse(created), 'Master vendor created successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = parseMasterVendorIdParam(req.params.id);
      const data = validate<UpdateMasterVendorDTO>(updateMasterVendorSchema, req.body);
      const existing = await packagingVendorService.getById(id);

      const registrationType = data.registration_type ?? existing.registration_type;
      const businessDetails = {
        ...existing.business_details,
        ...data.business_details,
      };
      assertMasterVendorRegistrationFields(registrationType, businessDetails, data.gst_number);

      const updated = await packagingVendorService.update(id, {
        ...data,
        updated_by: req.user?.userId,
      });
      return ResponseHandler.success(res, toResponse(updated), 'Master vendor updated successfully');
    } catch (error) {
      next(error);
    }
  }

  /** Soft-deactivate (status=inactive). Historical packaging refs remain. */
  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = parseMasterVendorIdParam(req.params.id);
      await packagingVendorService.delete(id);
      return ResponseHandler.success(
        res,
        null,
        'Master vendor deactivated successfully (status=inactive)'
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Lookup GST Number and return business details
   * Prefer shared GET /kyc/gstin/advanced for full KYC; this remains for packaging UI parity.
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

      let gstData;
      try {
        gstData = await gstLookupService.lookupGST(gstNumber);
      } catch (apiError: any) {
        if (apiError?.message?.includes('not found') || apiError?.statusCode === 404) {
          throw new NotFoundError('GST number not found. Please verify the GST number and try again.');
        }
        throw new InternalServerError('Failed to fetch GST details. Please try again later.');
      }

      const mappedData = gstLookupService.mapGSTToBusinessData(gstData);

      return ResponseHandler.success(
        res,
        {
          gst_data: gstData,
          mapped_data: mappedData,
        },
        'GST details fetched successfully'
      );
    } catch (error) {
      next(error);
    }
  }
}

export const packagingVendorController = new PackagingVendorController();
export const masterVendorController = packagingVendorController;
