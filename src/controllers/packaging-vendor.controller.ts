import { Response, NextFunction } from 'express';
import { packagingVendorService } from '../services/packaging-vendor.service';
import { ResponseHandler } from '../utils/response';
import { validate, uuidSchema } from '../utils/validators';
import { AuthRequest } from '../middleware/auth.middleware';
import { CreatePackagingVendorDTO, UpdatePackagingVendorDTO, PackagingVendorResponse } from '../models/packaging-vendor.model';
import { createPackagingVendorSchema, updatePackagingVendorSchema } from '../utils/validators';

export class PackagingVendorController {
  async getAll(_req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const vendors = await packagingVendorService.getAllVendors();

      const vendorResponses: PackagingVendorResponse[] = vendors.map((vendor) => ({
        id: vendor.id,
        name: vendor.name,
        contact_person: vendor.contact_person,
        phone: vendor.phone,
        email: vendor.email,
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
      const id = validate<string>(uuidSchema, req.params.id);
      const vendor = await packagingVendorService.getVendorById(id);

      const vendorResponse: PackagingVendorResponse = {
        id: vendor.id,
        name: vendor.name,
        contact_person: vendor.contact_person,
        phone: vendor.phone,
        email: vendor.email,
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
        contact_person: vendor.contact_person,
        phone: vendor.phone,
        email: vendor.email,
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
      const id = validate<string>(uuidSchema, req.params.id);
      const vendorData = validate<UpdatePackagingVendorDTO>(updatePackagingVendorSchema, req.body);

      if (req.user) {
        vendorData.updated_by = req.user.userId;
      }

      const vendor = await packagingVendorService.updateVendor(id, vendorData);

      const vendorResponse: PackagingVendorResponse = {
        id: vendor.id,
        name: vendor.name,
        contact_person: vendor.contact_person,
        phone: vendor.phone,
        email: vendor.email,
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
      const id = validate<string>(uuidSchema, req.params.id);
      await packagingVendorService.deleteVendor(id);

      return ResponseHandler.success(res, null, 'Packaging vendor deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

