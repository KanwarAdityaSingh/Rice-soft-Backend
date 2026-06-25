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
import {
  Address,
  BankDetails,
  ContactPerson,
  CreateVendorDTO,
  UpdateVendorDTO,
  Vendor,
  VendorResponse,
  VendorType,
  VendorRegistrationType,
} from '../models/vendor.model';
import { AuthRequest } from '../middleware/auth.middleware';
import { gstLookupService } from '../services/gst-lookup.service';
import { kycPersistenceService } from '../services/kyc-persistence.service';
import { parseEntityKycDetails } from '../utils/kyc-verification';
import { applyBankVerificationFromSnapshot } from '../utils/apply-bank-verification-from-snapshot';
import { appConfig } from '../config/app.config';
import { logger } from '../utils/logger';
import Joi from 'joi';
import { bankDetailsForVerifySchema } from '../utils/validators';

const LENIENT_BANK_VERIFY_FAIL_MESSAGE =
  'Vendor created but bank account holder name does not match the verification snapshot.';

const LENIENT_BANK_VERIFY_FAIL_MESSAGE_UPDATE =
  'Vendor updated but bank account holder name does not match the verification snapshot.';

/** Returned in `verification_message` when bank snapshot check + DB mark succeed at create/update */
const BANK_VERIFY_SUCCESS_MESSAGE = 'Bank details verified successfully.';

async function tryVerifyBankAfterSave(
  vendorId: string,
  bankDetails: BankDetails,
  kycVerificationDetails: ReturnType<typeof parseEntityKycDetails>,
  userId: string | undefined
) {
  return applyBankVerificationFromSnapshot({
    bankDetails,
    kycVerificationDetails,
    userId,
    markVerified: async (verifiedBy) => {
      await vendorDAO.markBankDetailsVerified(vendorId, verifiedBy);
    },
    setVerificationError: async (message) => {
      await vendorDAO.setBankVerificationError(vendorId, message);
    },
  });
}

function toVendorResponse(vendor: Vendor): VendorResponse {
  return {
    id: vendor.id,
    business_name: vendor.business_name,
    contact_persons: vendor.contact_persons,
    address: vendor.address,
    business_details: vendor.business_details,
    aadhar_number: vendor.aadhar_number ?? null,
    registration_type: vendor.registration_type,
    bank_details: vendor.bank_details,
    type: vendor.type,
    is_active: vendor.is_active,
    is_verified: vendor.is_verified,
    verified_at: vendor.verified_at?.toISOString() ?? null,
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
    kyc_verification_details: parseEntityKycDetails(vendor.kyc_verification_details),
  };
}

function assertVendorRegistrationFields(
  registrationType: VendorRegistrationType,
  businessDetails: CreateVendorDTO['business_details'],
  aadharNumber?: string | null
): void {
  if (registrationType === 'registered') {
    const hasGst = Boolean(businessDetails.gst_number?.trim());
    const hasPan = Boolean(businessDetails.pan_number?.trim());
    if (!hasGst && !hasPan) {
      throw new ValidationError('Registered vendors require GST or PAN in business_details');
    }
    return;
  }

  if (!aadharNumber?.trim()) {
    throw new ValidationError('Unregistered vendors require aadhar_number');
  }
}

function assertVendorRegistrationOnUpdate(existing: Vendor, update: UpdateVendorDTO): void {
  const registrationType = update.registration_type ?? existing.registration_type;
  const businessDetails = {
    ...existing.business_details,
    ...update.business_details,
  };
  const aadharNumber =
    update.aadhar_number !== undefined ? update.aadhar_number : existing.aadhar_number;

  assertVendorRegistrationFields(registrationType, businessDetails, aadharNumber);
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

      let isVerified: boolean | undefined;
      if (req.query.is_verified === 'true') {
        isVerified = true;
      } else if (req.query.is_verified === 'false') {
        isVerified = false;
      }

      const registrationType = req.query.registration_type as VendorRegistrationType | undefined;
      if (
        registrationType &&
        registrationType !== 'registered' &&
        registrationType !== 'unregistered'
      ) {
        throw new ValidationError('registration_type must be registered or unregistered');
      }

      const vendors = await vendorDAO.findAll({
        includeInactive,
        type,
        bankVerified,
        isVerified,
        registrationType,
      });

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

      if (verifyBank && !vendorPayload.kyc_verification_details?.bank) {
        throw new ValidationError(
          'verify_bank requires kyc_verification_details.bank from a prior GET /api/v1/kyc/bank/verify call'
        );
      }

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

      if (vendorPayload.aadhar_number) {
        const aadharExists = await vendorDAO.aadharExists(vendorPayload.aadhar_number);
        if (aadharExists) {
          throw new ConflictError('Aadhaar number already exists');
        }
      }

      assertVendorRegistrationFields(
        vendorPayload.registration_type,
        vendorPayload.business_details,
        vendorPayload.aadhar_number
      );

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
        const verifyResult = await tryVerifyBankAfterSave(
          vendor.id,
          vendor.bank_details,
          parseEntityKycDetails(vendor.kyc_verification_details),
          req.user?.userId
        );
        const refreshed = await vendorDAO.findById(vendor.id);
        if (verifyResult.status === 'verified') {
          return ResponseHandler.created(
            res,
            toVendorResponse(refreshed ?? vendor),
            'Vendor created successfully',
            { verification_message: BANK_VERIFY_SUCCESS_MESSAGE }
          );
        }
        logger.warn('Bank name mismatch after vendor create', {
          vendorId: vendor.id,
          status: verifyResult.status,
          error: verifyResult.message,
        });
        return ResponseHandler.created(
          res,
          toVendorResponse(refreshed ?? vendor),
          LENIENT_BANK_VERIFY_FAIL_MESSAGE,
          { verification_error: verifyResult.message, bank_verification_flagged: true }
        );
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

      if (vendorData.aadhar_number) {
        const aadharExists = await vendorDAO.aadharExists(vendorData.aadhar_number, id);
        if (aadharExists) {
          throw new ConflictError('Aadhaar number already exists');
        }
      }

      if (
        vendorData.registration_type !== undefined ||
        vendorData.business_details !== undefined ||
        vendorData.aadhar_number !== undefined
      ) {
        assertVendorRegistrationOnUpdate(existingVendor, vendorData);
      }

      const verifyBank = vendorData.verify_bank === true;
      if (verifyBank && !req.user?.userId) {
        throw new ValidationError('verify_bank requires an authenticated user');
      }

      // Set updated_by from authenticated user
      if (req.user) {
        vendorData.updated_by = req.user.userId;
      }

      const { verify_bank: _verifyBank, ...updatePayload } = vendorData;

      if (verifyBank) {
        const payloadHasBank = Boolean(updatePayload.kyc_verification_details?.bank);
        const existingHasBank = Boolean(
          parseEntityKycDetails(existingVendor.kyc_verification_details).bank
        );
        if (!payloadHasBank && !existingHasBank) {
          throw new ValidationError(
            'verify_bank requires kyc_verification_details.bank from a prior GET /api/v1/kyc/bank/verify call'
          );
        }
      }

      const vendor = await vendorDAO.update(id, updatePayload);
      if (!vendor) {
        throw new NotFoundError('Vendor not found after update');
      }

      if (updatePayload.bank_details !== undefined) {
        await vendorDAO.deactivatePurchaserVendorIfBankUnverified(vendor.id);
      }

      if (verifyBank && vendor.bank_details) {
        const verifyResult = await tryVerifyBankAfterSave(
          vendor.id,
          vendor.bank_details,
          parseEntityKycDetails(vendor.kyc_verification_details),
          req.user?.userId
        );
        const refreshed = await vendorDAO.findById(vendor.id);
        if (verifyResult.status === 'verified') {
          return ResponseHandler.success(
            res,
            toVendorResponse(refreshed ?? vendor),
            'Vendor updated successfully',
            200,
            { verification_message: BANK_VERIFY_SUCCESS_MESSAGE }
          );
        }
        logger.warn('Bank name mismatch after vendor update', {
          vendorId: vendor.id,
          status: verifyResult.status,
          error: verifyResult.message,
        });
        return ResponseHandler.success(
          res,
          toVendorResponse(refreshed ?? vendor),
          LENIENT_BANK_VERIFY_FAIL_MESSAGE_UPDATE,
          200,
          { verification_error: verifyResult.message, bank_verification_flagged: true }
        );
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
   * Lookup Aadhaar Number via Surepass and check availability in system
   */
  async lookupAadhaar(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const aadhaarNumber = req.query.aadhaar_number as string;

      if (!aadhaarNumber) {
        throw new ValidationError('Aadhaar number is required');
      }

      const envelope = await gstLookupService.validateAadhaar(aadhaarNumber);
      const cleaned = aadhaarNumber.replace(/\s/g, '');

      const vendorId = req.query.vendor_id as string | undefined;
      if (vendorId) {
        await kycPersistenceService.saveEntityVerification('vendor', vendorId, 'aadhaar', envelope);
      }

      const aadharExists = await vendorDAO.aadharExists(cleaned);
      if (aadharExists) {
        return ResponseHandler.success(
          res,
          {
            aadhaar_data: envelope.mapped,
            surepass_response: envelope.raw,
            is_valid: true,
            already_exists: true,
            message: 'Aadhaar number is valid but already exists in system',
          },
          'Aadhaar number validation completed'
        );
      }

      return ResponseHandler.success(
        res,
        {
          aadhaar_data: envelope.mapped,
          surepass_response: envelope.raw,
          is_valid: true,
          already_exists: false,
          message: 'Aadhaar number is valid and available',
        },
        'Aadhaar number validation completed'
      );
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
        kyc_verification_details: Joi.when('verify_bank', {
          is: true,
          then: Joi.object({
            bank: Joi.object().required(),
          }).required(),
          otherwise: Joi.object().optional(),
        }),
      });

      const body = validate(quickCreateSchema, req.body) as {
        gst_number: string;
        contact_persons: ContactPerson[];
        type: VendorType;
        bank_details?: BankDetails;
        verify_bank?: boolean;
        kyc_verification_details?: CreateVendorDTO['kyc_verification_details'];
      };
      const { gst_number, contact_persons, type, bank_details, verify_bank, kyc_verification_details } =
        body;
      const verifyBank = verify_bank === true;
      if (verifyBank && !req.user?.userId) {
        throw new ValidationError('verify_bank requires an authenticated user');
      }
      if (verifyBank && !kyc_verification_details?.bank) {
        throw new ValidationError(
          'verify_bank requires kyc_verification_details.bank from a prior GET /api/v1/kyc/bank/verify call'
        );
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
      const gstEnvelope = await gstLookupService.lookupGSTAdvanced(gst_number);
      const mappedData = gstLookupService.mapGSTAdvancedToBusinessData(gstEnvelope.mapped);

      // Create vendor with fetched + provided data
      const vendorData: CreateVendorDTO = {
        business_name: mappedData.business_name,
        contact_persons,
        address: mappedData.address,
        business_details: mappedData.business_details,
        registration_type: 'registered',
        bank_details: bank_details ?? undefined,
        kyc_verification_details,
        type,
        is_active: true,
        created_by: req.user?.userId,
      };

      const vendor = await vendorDAO.create(vendorData);
      await kycPersistenceService.saveEntityVerification(
        'vendor',
        vendor.id,
        'gst_advanced',
        gstEnvelope
      );

      if (verifyBank && vendor.bank_details) {
        const verifyResult = await tryVerifyBankAfterSave(
          vendor.id,
          vendor.bank_details,
          parseEntityKycDetails(
            (await vendorDAO.findById(vendor.id))?.kyc_verification_details ??
              vendor.kyc_verification_details
          ),
          req.user?.userId
        );
        const refreshed = await vendorDAO.findById(vendor.id);
        if (verifyResult.status === 'verified') {
          return ResponseHandler.created(
            res,
            toVendorResponse(refreshed ?? vendor),
            'Vendor created from GST successfully',
            { verification_message: BANK_VERIFY_SUCCESS_MESSAGE }
          );
        }
        logger.warn('Bank name mismatch after GST vendor create', {
          vendorId: vendor.id,
          status: verifyResult.status,
          error: verifyResult.message,
        });
        return ResponseHandler.created(
          res,
          toVendorResponse(refreshed ?? vendor),
          LENIENT_BANK_VERIFY_FAIL_MESSAGE,
          { verification_error: verifyResult.message, bank_verification_flagged: true }
        );
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
        kyc_verification_details: Joi.when('verify_bank', {
          is: true,
          then: Joi.object({
            bank: Joi.object().required(),
          }).required(),
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
        kyc_verification_details?: CreateVendorDTO['kyc_verification_details'];
      };
      const {
        pan_number,
        business_name,
        contact_persons,
        address,
        type,
        bank_details,
        verify_bank,
        kyc_verification_details,
      } = body;
      const verifyBank = verify_bank === true;
      if (verifyBank && !req.user?.userId) {
        throw new ValidationError('verify_bank requires an authenticated user');
      }
      if (verifyBank && !kyc_verification_details?.bank) {
        throw new ValidationError(
          'verify_bank requires kyc_verification_details.bank from a prior GET /api/v1/kyc/bank/verify call'
        );
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
      const panEnvelope = await gstLookupService.lookupPANComprehensive(pan_number);
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
        registration_type: 'registered',
        bank_details: bank_details ?? undefined,
        kyc_verification_details,
        type,
        is_active: true,
        created_by: req.user?.userId,
      };

      const vendor = await vendorDAO.create(vendorData);
      await kycPersistenceService.saveEntityVerification(
        'vendor',
        vendor.id,
        'pan_comprehensive',
        panEnvelope
      );

      if (verifyBank && vendor.bank_details) {
        const verifyResult = await tryVerifyBankAfterSave(
          vendor.id,
          vendor.bank_details,
          parseEntityKycDetails(vendor.kyc_verification_details),
          req.user?.userId
        );
        const refreshed = await vendorDAO.findById(vendor.id);
        if (verifyResult.status === 'verified') {
          return ResponseHandler.created(
            res,
            toVendorResponse(refreshed ?? vendor),
            'Vendor created from PAN successfully',
            { verification_message: BANK_VERIFY_SUCCESS_MESSAGE }
          );
        }
        logger.warn('Bank name mismatch after PAN vendor create', {
          vendorId: vendor.id,
          status: verifyResult.status,
          error: verifyResult.message,
        });
        return ResponseHandler.created(
          res,
          toVendorResponse(refreshed ?? vendor),
          LENIENT_BANK_VERIFY_FAIL_MESSAGE,
          { verification_error: verifyResult.message, bank_verification_flagged: true }
        );
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
      const envelope = await gstLookupService.verifyBankAccount(
        id_number.trim(),
        ifsc.trim()
      );

      return ResponseHandler.success(
        res,
        { ...envelope.mapped, surepass_response: envelope.raw },
        'Bank account verified successfully'
      );
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

      if (!vendor.bank_details?.account_holder_name?.trim()) {
        throw new ValidationError(
          'Vendor must have account_holder_name in bank_details before confirmation'
        );
      }

      const verifyResult = await tryVerifyBankAfterSave(
        id,
        vendor.bank_details,
        parseEntityKycDetails(vendor.kyc_verification_details),
        req.user.userId
      );

      const updated = await vendorDAO.findById(id);
      if (!updated) {
        throw new NotFoundError('Vendor not found');
      }

      if (verifyResult.status !== 'verified') {
        return ResponseHandler.success(
          res,
          toVendorResponse(updated),
          LENIENT_BANK_VERIFY_FAIL_MESSAGE_UPDATE,
          200,
          { verification_error: verifyResult.message, bank_verification_flagged: true }
        );
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

