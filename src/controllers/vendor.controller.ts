import { Response, NextFunction } from 'express';
import { vendorDAO } from '../dao/vendor.dao';
import { userDAO } from '../dao/user.dao';
import { ResponseHandler } from '../utils/response';
import {
  validate,
  createVendorSchema,
  updateVendorSchema,
  uuidSchema,
} from '../utils/validators';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
} from '../utils/errors';
import { CreateVendorDTO, UpdateVendorDTO, Vendor, VendorResponse, VendorType } from '../models/vendor.model';
import { AuthRequest } from '../middleware/auth.middleware';
import { gstLookupService } from '../services/gst-lookup.service';
import Joi from 'joi';

export class VendorController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const includeInactive = req.query.include_inactive === 'true';
      const type = req.query.type as VendorType | undefined;
      
      const vendors = await vendorDAO.findAll(includeInactive, type);

      const vendorResponses: VendorResponse[] = vendors.map((vendor) => ({
        id: vendor.id,
        business_name: vendor.business_name,
        contact_person: vendor.contact_person,
        email: vendor.email,
        phone: vendor.phone,
        address: vendor.address,
        business_details: vendor.business_details,
        bank_details: vendor.bank_details,
        type: vendor.type,
        is_active: vendor.is_active,
        user_id: vendor.user_id,
        lead_id: vendor.lead_id || null,
        created_at: vendor.created_at.toISOString(),
        updated_at: vendor.updated_at.toISOString(),
        last_enquiry_date: vendor.last_enquiry_date?.toISOString() || null,
        google_location_link: vendor.google_location_link,
        business_card_url: vendor.business_card_url,
      }));

      return ResponseHandler.success(res, vendorResponses);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      const vendor = await vendorDAO.findById(id);
      if (!vendor) {
        throw new NotFoundError('Vendor not found');
      }

      const vendorResponse: VendorResponse = {
        id: vendor.id,
        business_name: vendor.business_name,
        contact_person: vendor.contact_person,
        email: vendor.email,
        phone: vendor.phone,
        address: vendor.address,
        business_details: vendor.business_details,
        bank_details: vendor.bank_details,
        type: vendor.type,
        is_active: vendor.is_active,
        user_id: vendor.user_id,
        lead_id: vendor.lead_id || null,
        created_at: vendor.created_at.toISOString(),
        updated_at: vendor.updated_at.toISOString(),
        last_enquiry_date: vendor.last_enquiry_date?.toISOString() || null,
        google_location_link: vendor.google_location_link,
        business_card_url: vendor.business_card_url,
      };

      return ResponseHandler.success(res, vendorResponse);
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const vendorData = validate<CreateVendorDTO>(createVendorSchema, req.body);

      // Check if email already exists in vendors (only if email is provided)
      if (vendorData.email) {
        const emailExists = await vendorDAO.emailExists(vendorData.email);
        if (emailExists) {
          throw new ConflictError('Email already exists');
        }

        // Check if email already exists in users
        const userEmailExists = await userDAO.emailExists(vendorData.email);
        if (userEmailExists) {
          throw new ConflictError('Email already exists in users');
        }
      }

      // Check if GST already exists (if provided)
      if (vendorData.business_details.gst_number) {
        const gstExists = await vendorDAO.gstExists(vendorData.business_details.gst_number);
        if (gstExists) {
          throw new ConflictError('GST number already exists');
        }
      }

      // Check if PAN already exists (if provided)
      if (vendorData.business_details.pan_number) {
        const panExists = await vendorDAO.panExists(vendorData.business_details.pan_number);
        if (panExists) {
          throw new ConflictError('PAN number already exists');
        }
      }

      // Generate username from contact_person (first part before space, lowercase, remove special chars)
      let baseUsername = vendorData.contact_person
        .toLowerCase()
        .split(' ')[0]
        .replace(/[^a-z0-9]/g, '');
      
      // Check if username already exists and append number if needed
      let username = baseUsername;
      let counter = 1;
      while (await userDAO.usernameExists(username)) {
        username = `${baseUsername}${counter}`;
        counter++;
      }

      // Create user first (only if email is provided)
      let user = null;
      if (vendorData.email) {
        const userData = {
          username: username,
          email: vendorData.email,
          password: 'defaultPassword123', // Default password, should be changed on first login
          full_name: vendorData.contact_person,
          phone: vendorData.phone,
          user_type: 'vendor' as const,
          is_active: vendorData.is_active !== undefined ? vendorData.is_active : true,
          created_by: req.user?.userId,
        };

        try {
          user = await userDAO.create(userData);
        } catch (userError) {
          console.error('User creation failed:', userError);
          throw new ConflictError('Failed to create user account for vendor');
        }
      }

      // Create vendor with user_id (or undefined if no email)
      const vendorWithUser = {
        ...vendorData,
        user_id: user?.id,
        created_by: req.user?.userId,
      };

      const vendor = await vendorDAO.create(vendorWithUser);

      const vendorResponse: VendorResponse = {
        id: vendor.id,
        business_name: vendor.business_name,
        contact_person: vendor.contact_person,
        email: vendor.email,
        phone: vendor.phone,
        address: vendor.address,
        business_details: vendor.business_details,
        bank_details: vendor.bank_details,
        type: vendor.type,
        is_active: vendor.is_active,
        user_id: vendor.user_id,
        lead_id: vendor.lead_id || null,
        created_at: vendor.created_at.toISOString(),
        updated_at: vendor.updated_at.toISOString(),
        last_enquiry_date: vendor.last_enquiry_date?.toISOString() || null,
        google_location_link: vendor.google_location_link,
        business_card_url: vendor.business_card_url,
      };

      return ResponseHandler.created(res, vendorResponse, 'Vendor created successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const vendorData = validate<UpdateVendorDTO>(updateVendorSchema, req.body);

      // Check if vendor exists
      const existingVendor = await vendorDAO.findById(id);
      if (!existingVendor) {
        throw new NotFoundError('Vendor not found');
      }

      // Check if email already exists (if being updated)
      if (vendorData.email) {
        const emailExists = await vendorDAO.emailExists(vendorData.email, id);
        if (emailExists) {
          throw new ConflictError('Email already exists');
        }
      }

      // Check if GST already exists (if being updated)
      if (vendorData.business_details?.gst_number) {
        const gstExists = await vendorDAO.gstExists(vendorData.business_details.gst_number, id);
        if (gstExists) {
          throw new ConflictError('GST number already exists');
        }
      }

      // Check if PAN already exists (if being updated)
      if (vendorData.business_details?.pan_number) {
        const panExists = await vendorDAO.panExists(vendorData.business_details.pan_number, id);
        if (panExists) {
          throw new ConflictError('PAN number already exists');
        }
      }

      // Set updated_by from authenticated user
      if (req.user) {
        vendorData.updated_by = req.user.userId;
      }

      const vendor = await vendorDAO.update(id, vendorData);
      if (!vendor) {
        throw new NotFoundError('Vendor not found after update');
      }

      const vendorResponse: VendorResponse = {
        id: vendor.id,
        business_name: vendor.business_name,
        contact_person: vendor.contact_person,
        email: vendor.email,
        phone: vendor.phone,
        address: vendor.address,
        business_details: vendor.business_details,
        bank_details: vendor.bank_details,
        type: vendor.type,
        is_active: vendor.is_active,
        user_id: vendor.user_id,
        lead_id: vendor.lead_id || null,
        created_at: vendor.created_at.toISOString(),
        updated_at: vendor.updated_at.toISOString(),
        last_enquiry_date: vendor.last_enquiry_date?.toISOString() || null,
        google_location_link: vendor.google_location_link,
        business_card_url: vendor.business_card_url,
      };

      return ResponseHandler.success(res, vendorResponse, 'Vendor updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      // Check if vendor exists
      const vendor = await vendorDAO.findById(id);
      if (!vendor) {
        throw new NotFoundError('Vendor not found');
      }

      await vendorDAO.delete(id);

      return ResponseHandler.success(res, null, 'Vendor deleted successfully');
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
      const gstData = await gstLookupService.lookupGST(gstNumber);

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

  /**
   * Lookup PAN Number and return business details
   */
  async lookupPAN(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const panNumber = req.query.pan_number as string;

      if (!panNumber) {
        throw new ValidationError('PAN number is required');
      }

      // Validate PAN format
      if (!gstLookupService.validatePANFormat(panNumber)) {
        throw new ValidationError('Invalid PAN number format. Expected format: ABCDE1234F');
      }

      // Fetch PAN details from API
      const panData = await gstLookupService.lookupPAN(panNumber);

      // Map to our application format
      const mappedData = gstLookupService.mapPANToBusinessData(panData);

      return ResponseHandler.success(res, {
        pan_data: panData,
        mapped_data: mappedData,
      }, 'PAN details fetched successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Quick create vendor from GST number
   * Fetches GST details and creates vendor with minimal additional input
   */
  async createFromGST(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { gst_number, contact_person, email, phone, type, bank_details } = req.body;

      // Validate required fields
      const quickCreateSchema = Joi.object({
        gst_number: Joi.string().required().length(15),
        contact_person: Joi.string().required().min(2).max(255),
        email: Joi.string().required().email(),
        phone: Joi.string().required().max(20),
        type: Joi.string().required().valid('purchaser', 'seller', 'both'),
        bank_details: Joi.object().optional(),
      });

      validate(quickCreateSchema, req.body);

      // Validate GST format
      if (!gstLookupService.validateGSTFormat(gst_number)) {
        throw new ValidationError('Invalid GST number format');
      }

      // Check if GST already exists
      const gstExists = await vendorDAO.gstExists(gst_number);
      if (gstExists) {
        throw new ConflictError('GST number already exists');
      }

      // Check if email already exists
      const emailExists = await vendorDAO.emailExists(email);
      if (emailExists) {
        throw new ConflictError('Email already exists');
      }

      // Fetch GST details
      const gstData = await gstLookupService.lookupGST(gst_number);
      const mappedData = gstLookupService.mapGSTToBusinessData(gstData);

      // Create vendor with fetched + provided data
      const vendorData: CreateVendorDTO = {
        business_name: mappedData.business_name,
        contact_person,
        email,
        phone,
        address: mappedData.address,
        business_details: mappedData.business_details,
        bank_details: bank_details || null,
        type,
        is_active: true,
        created_by: req.user?.userId,
      };

      const vendor = await vendorDAO.create(vendorData);

      const vendorResponse: VendorResponse = {
        id: vendor.id,
        business_name: vendor.business_name,
        contact_person: vendor.contact_person,
        email: vendor.email,
        phone: vendor.phone,
        address: vendor.address,
        business_details: vendor.business_details,
        bank_details: vendor.bank_details,
        type: vendor.type,
        is_active: vendor.is_active,
        user_id: vendor.user_id,
        lead_id: vendor.lead_id || null,
        created_at: vendor.created_at.toISOString(),
        updated_at: vendor.updated_at.toISOString(),
        last_enquiry_date: vendor.last_enquiry_date?.toISOString() || null,
        google_location_link: vendor.google_location_link,
        business_card_url: vendor.business_card_url,
      };

      return ResponseHandler.created(res, vendorResponse, 'Vendor created from GST successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Quick create vendor from PAN number
   * Fetches PAN details and creates vendor with additional required input
   */
  async createFromPAN(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { pan_number, business_name, contact_person, email, phone, address, type, bank_details } = req.body;

      // Validate required fields (PAN gives less info, so we need more input)
      const quickCreateSchema = Joi.object({
        pan_number: Joi.string().required().length(10),
        business_name: Joi.string().optional().min(2).max(255),
        contact_person: Joi.string().required().min(2).max(255),
        email: Joi.string().required().email(),
        phone: Joi.string().required().max(20),
        address: Joi.object({
          street: Joi.string().required().max(255),
          city: Joi.string().required().max(100),
          state: Joi.string().required().max(100),
          pincode: Joi.string().required().max(10),
          country: Joi.string().required().max(100),
        }).required(),
        type: Joi.string().required().valid('purchaser', 'seller', 'both'),
        bank_details: Joi.object().optional(),
      });

      validate(quickCreateSchema, req.body);

      // Validate PAN format
      if (!gstLookupService.validatePANFormat(pan_number)) {
        throw new ValidationError('Invalid PAN number format');
      }

      // Check if PAN already exists
      const panExists = await vendorDAO.panExists(pan_number);
      if (panExists) {
        throw new ConflictError('PAN number already exists');
      }

      // Check if email already exists
      const emailExists = await vendorDAO.emailExists(email);
      if (emailExists) {
        throw new ConflictError('Email already exists');
      }

      // Fetch PAN details
      const panData = await gstLookupService.lookupPAN(pan_number);
      const mappedData = gstLookupService.mapPANToBusinessData(panData);

      // Create vendor with fetched + provided data
      const vendorData: CreateVendorDTO = {
        business_name: business_name || mappedData.business_name,
        contact_person,
        email,
        phone,
        address,
        business_details: {
          ...mappedData.business_details,
          pan_number,
        },
        bank_details: bank_details || null,
        type,
        is_active: true,
        created_by: req.user?.userId,
      };

      const vendor = await vendorDAO.create(vendorData);

      const vendorResponse: VendorResponse = {
        id: vendor.id,
        business_name: vendor.business_name,
        contact_person: vendor.contact_person,
        email: vendor.email,
        phone: vendor.phone,
        address: vendor.address,
        business_details: vendor.business_details,
        bank_details: vendor.bank_details,
        type: vendor.type,
        is_active: vendor.is_active,
        user_id: vendor.user_id,
        lead_id: vendor.lead_id || null,
        created_at: vendor.created_at.toISOString(),
        updated_at: vendor.updated_at.toISOString(),
        last_enquiry_date: vendor.last_enquiry_date?.toISOString() || null,
        google_location_link: vendor.google_location_link,
        business_card_url: vendor.business_card_url,
      };

      return ResponseHandler.created(res, vendorResponse, 'Vendor created from PAN successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Check if vendor exists by GST or PAN number
   * Returns vendor details if found, otherwise returns exists: false
   */
  async checkVendorExists(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const gstNumber = req.query.gst_number as string | undefined;
      const panNumber = req.query.pan_number as string | undefined;

      if (!gstNumber && !panNumber) {
        throw new ValidationError('Either GST number or PAN number is required');
      }

      let vendor: Vendor | null = null;

      // Check by GST first if provided
      if (gstNumber) {
        // Validate GST format
        if (!gstLookupService.validateGSTFormat(gstNumber)) {
          throw new ValidationError('Invalid GST number format. Expected format: 27ABCDE1234F1Z5');
        }
        vendor = await vendorDAO.findByGST(gstNumber);
      }

      // If not found by GST, check by PAN
      if (!vendor && panNumber) {
        // Validate PAN format
        if (!gstLookupService.validatePANFormat(panNumber)) {
          throw new ValidationError('Invalid PAN number format. Expected format: ABCDE1234F');
        }
        vendor = await vendorDAO.findByPAN(panNumber);
      }

      if (vendor) {
        const vendorResponse: VendorResponse = {
          id: vendor.id,
          business_name: vendor.business_name,
          contact_person: vendor.contact_person,
          email: vendor.email,
          phone: vendor.phone,
          address: vendor.address,
          business_details: vendor.business_details,
          bank_details: vendor.bank_details,
          type: vendor.type,
          is_active: vendor.is_active,
          user_id: vendor.user_id,
          lead_id: vendor.lead_id || null,
          created_at: vendor.created_at.toISOString(),
          updated_at: vendor.updated_at.toISOString(),
          last_enquiry_date: vendor.last_enquiry_date?.toISOString() || null,
          google_location_link: vendor.google_location_link,
          business_card_url: vendor.business_card_url,
        };

        return ResponseHandler.success(res, {
          exists: true,
          vendor: vendorResponse,
        }, 'Vendor found');
      }

      return ResponseHandler.success(res, {
        exists: false,
        vendor: null,
      }, 'Vendor not found');
    } catch (error) {
      next(error);
    }
  }
}

export const vendorController = new VendorController();

