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
  UnauthorizedError,
} from '../utils/errors';
import { assertEnteredAccountHolderMatchesBankRecord } from '../utils/bank-account-holder-match';
import {
  Address,
  BankDetails,
  ContactPerson,
  CreateVendorDTO,
  UpdateVendorDTO,
  Vendor,
  VendorResponse,
  VendorType,
} from '../models/vendor.model';
import { AuthRequest } from '../middleware/auth.middleware';
import { gstLookupService } from '../services/gst-lookup.service';
import { appConfig } from '../config/app.config';
import { logger } from '../utils/logger';
import Joi from 'joi';
import { bankDetailsForVerifySchema } from '../utils/validators';

const LENIENT_BANK_VERIFY_FAIL_MESSAGE =
  'Vendor created but bank could not be verified.';

/** Returned in `verification_message` when Surepass bank check + DB mark succeed at create */
const BANK_VERIFY_SUCCESS_MESSAGE = 'Bank details verified successfully.';

function verificationErrorFromUnknown(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * After insert: Surepass + mark verified. Throws only for missing auth (caller should pre-check).
 */
async function tryVerifyBankOnCreate(
  vendorId: string,
  bankDetails: BankDetails,
  userId: string | undefined
): Promise<void> {
  if (!userId) {
    throw new ValidationError('Bank verification at creation requires an authenticated user');
  }
  const accountDigits = (bankDetails.account_number ?? '').replace(/\D/g, '');
  const ifsc = (bankDetails.ifsc_code ?? '').trim().toUpperCase();
  if (accountDigits.length < 9 || accountDigits.length > 18 || !ifsc) {
    throw new ValidationError('Invalid bank account for verification');
  }
  const verificationResult = await gstLookupService.verifyBankAccount(accountDigits, ifsc);
  assertEnteredAccountHolderMatchesBankRecord(
    bankDetails.account_holder_name,
    verificationResult.account_holder_name
  );
  await vendorDAO.markBankDetailsVerified(vendorId, userId);
}

function toVendorResponse(vendor: Vendor): VendorResponse {
  return {
    id: vendor.id,
    business_name: vendor.business_name,
    contact_persons: vendor.contact_persons,
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
    bank_details_verified_at: vendor.bank_details_verified_at?.toISOString() ?? null,
    bank_details_verified_by: vendor.bank_details_verified_by ?? null,
    bank_verification_error: vendor.bank_verification_error ?? null,
  };
}

export class VendorController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const includeInactive = req.query.include_inactive === 'true';
      const type = req.query.type as VendorType | undefined;
      const bankVerifiedRaw = req.query.bank_verified as string | undefined;
      let bankVerified: boolean | undefined;
      if (bankVerifiedRaw === 'true') {
        bankVerified = true;
      } else if (bankVerifiedRaw === 'false') {
        bankVerified = false;
      }

      const vendors = await vendorDAO.findAll(includeInactive, type, bankVerified);

      const vendorResponses: VendorResponse[] = vendors.map(toVendorResponse);

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

      return ResponseHandler.success(res, toVendorResponse(vendor));
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const vendorData = validate<CreateVendorDTO>(createVendorSchema, req.body);
      const verifyBank = vendorData.verify_bank === true;
      if (verifyBank && !req.user?.userId) {
        throw new ValidationError('verify_bank requires an authenticated user');
      }

      const { verify_bank: _verifyBank, ...vendorPayload } = vendorData;

      // Get first contact person for user creation and validation
      const firstContactPerson = vendorPayload.contact_persons[0];
      const primaryEmail = firstContactPerson.emails?.[0];
      const primaryPhone = firstContactPerson.phones[0];

      // Check if email already exists in vendors (only if email is provided)
      if (primaryEmail) {
        const emailExists = await vendorDAO.emailExists(primaryEmail);
        if (emailExists) {
          throw new ConflictError('Email already exists');
        }

        // Check if email already exists in users
        const userEmailExists = await userDAO.emailExists(primaryEmail);
        if (userEmailExists) {
          throw new ConflictError('Email already exists in users');
        }
      }

      // Check if GST already exists (if provided)
      if (vendorPayload.business_details.gst_number) {
        const gstExists = await vendorDAO.gstExists(vendorPayload.business_details.gst_number);
        if (gstExists) {
          throw new ConflictError('GST number already exists');
        }
      }

      // Check if PAN already exists (if provided)
      if (vendorPayload.business_details.pan_number) {
        const panExists = await vendorDAO.panExists(vendorPayload.business_details.pan_number);
        if (panExists) {
          throw new ConflictError('PAN number already exists');
        }
      }

      // Generate username from first contact person name (first part before space, lowercase, remove special chars)
      let baseUsername = firstContactPerson.name
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
      if (primaryEmail) {
        const userData = {
          username: username,
          email: primaryEmail,
          password: 'defaultPassword123', // Default password, should be changed on first login
          full_name: firstContactPerson.name,
          phone: primaryPhone,
          user_type: 'vendor' as const,
          is_active: vendorPayload.is_active !== undefined ? vendorPayload.is_active : true,
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
        ...vendorPayload,
        user_id: user?.id,
        created_by: req.user?.userId,
      };

      const vendor = await vendorDAO.create(vendorWithUser);

      if (verifyBank && vendor.bank_details) {
        try {
          await tryVerifyBankOnCreate(vendor.id, vendor.bank_details, req.user?.userId);
          const refreshed = await vendorDAO.findById(vendor.id);
          return ResponseHandler.created(
            res,
            toVendorResponse(refreshed ?? vendor),
            'Vendor created successfully',
            { verification_message: BANK_VERIFY_SUCCESS_MESSAGE }
          );
        } catch (verifyErr) {
          const errMsg = verificationErrorFromUnknown(verifyErr);
          logger.warn('Bank verification failed after vendor create (lenient)', {
            vendorId: vendor.id,
            error: errMsg,
          });
          await vendorDAO.setBankVerificationError(vendor.id, errMsg);
          const refreshed = await vendorDAO.findById(vendor.id);
          return ResponseHandler.created(
            res,
            toVendorResponse(refreshed ?? vendor),
            LENIENT_BANK_VERIFY_FAIL_MESSAGE,
            { verification_error: errMsg }
          );
        }
      }

      return ResponseHandler.created(res, toVendorResponse(vendor), 'Vendor created successfully');
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

      return ResponseHandler.success(res, toVendorResponse(vendor), 'Vendor updated successfully');
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
      // Validate required fields
      const quickCreateSchema = Joi.object({
        gst_number: Joi.string().required().length(15),
        contact_persons: Joi.array().items(
          Joi.object({
            name: Joi.string().required().min(2).max(255),
            phones: Joi.array().items(Joi.string().max(20)).required().min(1),
            emails: Joi.array().items(Joi.string().email()).optional()
          })
        ).required().min(1),
        type: Joi.string().required().valid('purchaser', 'seller', 'both'),
        verify_bank: Joi.boolean().optional(),
        bank_details: Joi.when('verify_bank', {
          is: true,
          then: bankDetailsForVerifySchema.required(),
          otherwise: Joi.object().optional(),
        }),
      });

      const body = validate(quickCreateSchema, req.body) as {
        gst_number: string;
        contact_persons: ContactPerson[];
        type: VendorType;
        bank_details?: BankDetails;
        verify_bank?: boolean;
      };
      const { gst_number, contact_persons, type, bank_details, verify_bank } = body;
      const verifyBank = verify_bank === true;
      if (verifyBank && !req.user?.userId) {
        throw new ValidationError('verify_bank requires an authenticated user');
      }

      // Validate GST format
      if (!gstLookupService.validateGSTFormat(gst_number)) {
        throw new ValidationError('Invalid GST number format');
      }

      // Check if GST already exists
      const gstExists = await vendorDAO.gstExists(gst_number);
      if (gstExists) {
        throw new ConflictError('GST number already exists');
      }

      // Get first contact person for email check
      const firstContactPerson = contact_persons[0];
      const primaryEmail = firstContactPerson.emails?.[0];

      // Check if email already exists (only if email is provided)
      if (primaryEmail) {
        const emailExists = await vendorDAO.emailExists(primaryEmail);
        if (emailExists) {
          throw new ConflictError('Email already exists');
        }
      }

      // Fetch GST details
      const gstData = await gstLookupService.lookupGST(gst_number);
      const mappedData = gstLookupService.mapGSTToBusinessData(gstData);

      // Create vendor with fetched + provided data
      const vendorData: CreateVendorDTO = {
        business_name: mappedData.business_name,
        contact_persons,
        address: mappedData.address,
        business_details: mappedData.business_details,
        bank_details: bank_details ?? undefined,
        type,
        is_active: true,
        created_by: req.user?.userId,
      };

      const vendor = await vendorDAO.create(vendorData);

      if (verifyBank && vendor.bank_details) {
        try {
          await tryVerifyBankOnCreate(vendor.id, vendor.bank_details, req.user?.userId);
          const refreshed = await vendorDAO.findById(vendor.id);
          return ResponseHandler.created(
            res,
            toVendorResponse(refreshed ?? vendor),
            'Vendor created from GST successfully',
            { verification_message: BANK_VERIFY_SUCCESS_MESSAGE }
          );
        } catch (verifyErr) {
          const errMsg = verificationErrorFromUnknown(verifyErr);
          logger.warn('Bank verification failed after GST vendor create (lenient)', {
            vendorId: vendor.id,
            error: errMsg,
          });
          await vendorDAO.setBankVerificationError(vendor.id, errMsg);
          const refreshed = await vendorDAO.findById(vendor.id);
          return ResponseHandler.created(
            res,
            toVendorResponse(refreshed ?? vendor),
            LENIENT_BANK_VERIFY_FAIL_MESSAGE,
            { verification_error: errMsg }
          );
        }
      }

      return ResponseHandler.created(res, toVendorResponse(vendor), 'Vendor created from GST successfully');
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
      // Validate required fields (PAN gives less info, so we need more input)
      const quickCreateSchema = Joi.object({
        pan_number: Joi.string().required().length(10),
        business_name: Joi.string().optional().min(2).max(255),
        contact_persons: Joi.array().items(
          Joi.object({
            name: Joi.string().required().min(2).max(255),
            phones: Joi.array().items(Joi.string().max(20)).required().min(1),
            emails: Joi.array().items(Joi.string().email()).optional()
          })
        ).required().min(1),
        address: Joi.object({
          street: Joi.string().required().max(255),
          city: Joi.string().required().max(100),
          state: Joi.string().required().max(100),
          pincode: Joi.string().required().max(10),
          country: Joi.string().required().max(100),
        }).required(),
        type: Joi.string().required().valid('purchaser', 'seller', 'both'),
        verify_bank: Joi.boolean().optional(),
        bank_details: Joi.when('verify_bank', {
          is: true,
          then: bankDetailsForVerifySchema.required(),
          otherwise: Joi.object().optional(),
        }),
      });

      const body = validate(quickCreateSchema, req.body) as {
        pan_number: string;
        business_name?: string;
        contact_persons: ContactPerson[];
        address: Address;
        type: VendorType;
        bank_details?: BankDetails;
        verify_bank?: boolean;
      };
      const { pan_number, business_name, contact_persons, address, type, bank_details, verify_bank } = body;
      const verifyBank = verify_bank === true;
      if (verifyBank && !req.user?.userId) {
        throw new ValidationError('verify_bank requires an authenticated user');
      }

      // Validate PAN format
      if (!gstLookupService.validatePANFormat(pan_number)) {
        throw new ValidationError('Invalid PAN number format');
      }

      // Check if PAN already exists
      const panExists = await vendorDAO.panExists(pan_number);
      if (panExists) {
        throw new ConflictError('PAN number already exists');
      }

      // Get first contact person for email check
      const firstContactPerson = contact_persons[0];
      const primaryEmail = firstContactPerson.emails?.[0];

      // Check if email already exists (only if email is provided)
      if (primaryEmail) {
        const emailExists = await vendorDAO.emailExists(primaryEmail);
        if (emailExists) {
          throw new ConflictError('Email already exists');
        }
      }

      // Fetch PAN details
      const panData = await gstLookupService.lookupPAN(pan_number);
      const mappedData = gstLookupService.mapPANToBusinessData(panData);

      // Create vendor with fetched + provided data
      const vendorData: CreateVendorDTO = {
        business_name: business_name || mappedData.business_name,
        contact_persons,
        address,
        business_details: {
          ...mappedData.business_details,
          pan_number,
        },
        bank_details: bank_details ?? undefined,
        type,
        is_active: true,
        created_by: req.user?.userId,
      };

      const vendor = await vendorDAO.create(vendorData);

      if (verifyBank && vendor.bank_details) {
        try {
          await tryVerifyBankOnCreate(vendor.id, vendor.bank_details, req.user?.userId);
          const refreshed = await vendorDAO.findById(vendor.id);
          return ResponseHandler.created(
            res,
            toVendorResponse(refreshed ?? vendor),
            'Vendor created from PAN successfully',
            { verification_message: BANK_VERIFY_SUCCESS_MESSAGE }
          );
        } catch (verifyErr) {
          const errMsg = verificationErrorFromUnknown(verifyErr);
          logger.warn('Bank verification failed after PAN vendor create (lenient)', {
            vendorId: vendor.id,
            error: errMsg,
          });
          await vendorDAO.setBankVerificationError(vendor.id, errMsg);
          const refreshed = await vendorDAO.findById(vendor.id);
          return ResponseHandler.created(
            res,
            toVendorResponse(refreshed ?? vendor),
            LENIENT_BANK_VERIFY_FAIL_MESSAGE,
            { verification_error: errMsg }
          );
        }
      }

      return ResponseHandler.created(res, toVendorResponse(vendor), 'Vendor created from PAN successfully');
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
        return ResponseHandler.success(res, {
          exists: true,
          vendor: toVendorResponse(vendor),
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

  /**
   * Verify bank account details using Surepass API
   */
  async verifyBankAccount(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { id_number, ifsc } = req.query;

      if (!id_number || typeof id_number !== 'string' || id_number.trim() === '') {
        throw new ValidationError('id_number is required and must be a valid string');
      }

      if (!ifsc || typeof ifsc !== 'string' || ifsc.trim() === '') {
        throw new ValidationError('ifsc is required and must be a valid string');
      }

      // Verify bank account
      const verificationResult = await gstLookupService.verifyBankAccount(
        id_number.trim(),
        ifsc.trim()
      );

      return ResponseHandler.success(res, verificationResult, 'Bank account verified successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Confirms stored bank_details for this vendor via Surepass and persists verification metadata.
   * POST after the client has saved account + IFSC on the vendor (or uses existing saved values).
   */
  async confirmBankVerification(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      if (!req.user?.userId) {
        throw new UnauthorizedError('Authentication required');
      }

      const vendor = await vendorDAO.findById(id);
      if (!vendor) {
        throw new NotFoundError('Vendor not found');
      }

      const bd = vendor.bank_details;
      const accountDigits = (bd?.account_number ?? '').replace(/\D/g, '');
      const ifsc = (bd?.ifsc_code ?? '').trim().toUpperCase();

      if (!bd || accountDigits.length < 9 || accountDigits.length > 18) {
        throw new ValidationError(
          'Vendor must have a valid bank account number (9–18 digits) in bank_details before confirmation'
        );
      }
      if (!ifsc) {
        throw new ValidationError('Vendor must have IFSC in bank_details before confirmation');
      }

      const enteredName = bd.account_holder_name?.trim();
      if (!enteredName) {
        throw new ValidationError(
          'Vendor must have account_holder_name in bank_details before confirmation'
        );
      }

      const verificationResult = await gstLookupService.verifyBankAccount(accountDigits, ifsc);
      assertEnteredAccountHolderMatchesBankRecord(enteredName, verificationResult.account_holder_name);

      const updated = await vendorDAO.markBankDetailsVerified(id, req.user.userId);
      if (!updated) {
        throw new NotFoundError('Vendor not found');
      }

      return ResponseHandler.success(res, toVendorResponse(updated), 'Bank details verified and saved');
    } catch (error) {
      next(error);
    }
  }

  async getDefaultRecipient(_req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const defaultRecipient = {
        name: appConfig.defaultRecipient.name,
        address: appConfig.defaultRecipient.address,
        llpin: appConfig.defaultRecipient.llpin,
      };

      return ResponseHandler.success(res, defaultRecipient, 'Default recipient retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const vendorController = new VendorController();

