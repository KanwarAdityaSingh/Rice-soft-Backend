import { Response, NextFunction } from 'express';
import { packagingVendorService } from '../services/packaging-vendor.service';
import { ResponseHandler } from '../utils/response';
import { validate, uuidSchema } from '../utils/validators';
import { AuthRequest } from '../middleware/auth.middleware';
import { CreatePackagingVendorDTO, UpdatePackagingVendorDTO, PackagingVendorResponse } from '../models/packaging-vendor.model';
import { createPackagingVendorSchema, updatePackagingVendorSchema } from '../utils/validators';
import { gstLookupService } from '../services/gst-lookup.service';
import { ValidationError, NotFoundError, InternalServerError } from '../utils/errors';

function parsePackagingVendorIdParam(raw: string | undefined): string {
  if (!raw) {
    throw new ValidationError('Packaging vendor id is required');
  }
  try {
    return validate<string>(uuidSchema, raw);
  } catch {
    throw new ValidationError(
      'Invalid packaging vendor id. For GSTIN lookup use GET /api/v1/packaging-vendors/lookupGST?gst_number=<GSTIN>.'
    );
  }
}

export class PackagingVendorController {
  async getAll(_req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const vendors = await packagingVendorService.getAllVendors();

      const vendorResponses: PackagingVendorResponse[] = vendors.map((vendor) => ({
        id: vendor.id,
        name: vendor.name,
        contact_persons: vendor.contact_persons,
        address: vendor.address,
        gst_number: vendor.gst_number,
        created_at: vendor.created_at.toISOString(),
        updated_at: vendor.updated_at.toISOString(),
      }));

      return ResponseHandler.success(res, vendorResponses);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = parsePackagingVendorIdParam(req.params.id);
      const vendor = await packagingVendorService.getVendorById(id);

      const vendorResponse: PackagingVendorResponse = {
        id: vendor.id,
        name: vendor.name,
        contact_persons: vendor.contact_persons,
        address: vendor.address,
        gst_number: vendor.gst_number,
        created_at: vendor.created_at.toISOString(),
        updated_at: vendor.updated_at.toISOString(),
      };

      return ResponseHandler.success(res, vendorResponse);
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const vendorData = validate<CreatePackagingVendorDTO>(createPackagingVendorSchema, req.body);

      if (req.user) {
        vendorData.created_by = req.user.userId;
      }

      const vendor = await packagingVendorService.createVendor(vendorData);

      const vendorResponse: PackagingVendorResponse = {
        id: vendor.id,
        name: vendor.name,
        contact_persons: vendor.contact_persons,
        address: vendor.address,
        gst_number: vendor.gst_number,
        created_at: vendor.created_at.toISOString(),
        updated_at: vendor.updated_at.toISOString(),
      };

      return ResponseHandler.created(res, vendorResponse, 'Packaging vendor created successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = parsePackagingVendorIdParam(req.params.id);
      const vendorData = validate<UpdatePackagingVendorDTO>(updatePackagingVendorSchema, req.body);

      if (req.user) {
        vendorData.updated_by = req.user.userId;
      }

      const vendor = await packagingVendorService.updateVendor(id, vendorData);

      const vendorResponse: PackagingVendorResponse = {
        id: vendor.id,
        name: vendor.name,
        contact_persons: vendor.contact_persons,
        address: vendor.address,
        gst_number: vendor.gst_number,
        created_at: vendor.created_at.toISOString(),
        updated_at: vendor.updated_at.toISOString(),
      };

      return ResponseHandler.success(res, vendorResponse, 'Packaging vendor updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = parsePackagingVendorIdParam(req.params.id);
      await packagingVendorService.deleteVendor(id);

      return ResponseHandler.success(res, null, 'Packaging vendor deleted successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Lookup GST Number and return business details
   */
  async lookupGST(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const gstNumber = req.query.gst_number as string;

      if (!gstNumber) {
        throw new ValidationError('GST number is required');
      }

      // Validate GST format
      if (!gstLookupService.validateGSTFormat(gstNumber)) {
        throw new ValidationError('Invalid GST number format. Expected format: 27ABCDE1234F1Z5');
      }

      // Fetch GST details from API
      let gstData;
      try {
        gstData = await gstLookupService.lookupGST(gstNumber);
      } catch (apiError: any) {
        if (apiError?.message?.includes('not found') || apiError?.statusCode === 404) {
          throw new NotFoundError('GST number not found. Please verify the GST number and try again.');
        }
        throw new InternalServerError('Failed to fetch GST details. Please try again later.');
      }

      // Map to our application format
      const mappedData = gstLookupService.mapGSTToBusinessData(gstData);

      return ResponseHandler.success(res, {
        gst_data: gstData,
        mapped_data: mappedData,
      }, 'GST details fetched successfully');
    } catch (error) {
      next(error);
    }
  }
}

