import { Response, NextFunction } from 'express';
import { brokerDAO } from '../dao/broker.dao';
import { purchaseSummaryDAO } from '../dao/purchase-summary.dao';
import { userDAO } from '../dao/user.dao';
import { ResponseHandler } from '../utils/response';
import {
  validate,
  createBrokerSchema,
  updateBrokerSchema,
  uuidSchema,
  brokerBrokerageCommissionSummaryQuerySchema,
} from '../utils/validators';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  InternalServerError,
  UnauthorizedError,
} from '../utils/errors';
import { assertEnteredAccountHolderMatchesBankRecord } from '../utils/bank-account-holder-match';
import {
  BankDetails,
  Broker,
  CreateBrokerDTO,
  UpdateBrokerDTO,
  BrokerResponse,
  BrokerType,
} from '../models/broker.model';
import { AuthRequest } from '../middleware/auth.middleware';
import { gstLookupService } from '../services/gst-lookup.service';
import { logger } from '../utils/logger';
import { bankDetailsForVerifySchema } from '../utils/validators';
import Joi from 'joi';

const LENIENT_BANK_VERIFY_FAIL_MESSAGE =
  'Broker created but bank could not be verified.';

const BANK_VERIFY_SUCCESS_MESSAGE = 'Bank details verified successfully.';

function verificationErrorFromUnknown(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * After insert: Surepass + mark verified. Throws only for missing auth (caller should pre-check).
 */
async function tryVerifyBankOnCreate(
  brokerId: string,
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
  await brokerDAO.markBankDetailsVerified(brokerId, userId);
}

function toBrokerResponse(broker: Broker): BrokerResponse {
  return {
    id: broker.id,
    business_name: broker.business_name,
    contact_persons: broker.contact_persons,
    address: broker.address,
    business_details: broker.business_details,
    bank_details: broker.bank_details,
    broker_details: broker.broker_details,
    type: broker.type,
    is_active: broker.is_active,
    created_at: broker.created_at.toISOString(),
    updated_at: broker.updated_at.toISOString(),
    bank_details_verified_at: broker.bank_details_verified_at?.toISOString() ?? null,
    bank_details_verified_by: broker.bank_details_verified_by ?? null,
    bank_verification_error: broker.bank_verification_error ?? null,
  };
}

export class BrokerController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const includeInactive = req.query.include_inactive === 'true';
      const type = req.query.type as BrokerType | undefined;
      const bankVerifiedRaw = req.query.bank_verified as string | undefined;
      let bankVerified: boolean | undefined;
      if (bankVerifiedRaw === 'true') {
        bankVerified = true;
      } else if (bankVerifiedRaw === 'false') {
        bankVerified = false;
      }

      const brokers = await brokerDAO.findAll(includeInactive, type, bankVerified);

      const brokerResponses: BrokerResponse[] = brokers.map(toBrokerResponse);

      return ResponseHandler.success(res, brokerResponses);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      const broker = await brokerDAO.findById(id);
      if (!broker) {
        throw new NotFoundError('Broker not found');
      }

      return ResponseHandler.success(res, toBrokerResponse(broker));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Purchase saudas for this broker: computed brokerage per sauda (same engine as purchase summary) + total.
   * @query godown_id — optional; scopes lots/ISPs like GET /purchase-summary/sauda/:id
   * @query status — optional filter: draft|active|completed|cancelled
   * @query from_date, to_date — optional YYYY-MM-DD filter on sauda_date
   */
  async getBrokerageCommissionSummary(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> {
    try {
      const brokerId = validate<string>(uuidSchema, req.params.brokerId);
      const q = validate<{
        godown_id?: string;
        status?: string;
        from_date?: string;
        to_date?: string;
      }>(brokerBrokerageCommissionSummaryQuerySchema, req.query);

      const broker = await brokerDAO.findById(brokerId);
      if (!broker) {
        throw new NotFoundError('Broker not found');
      }

      const summary = await purchaseSummaryDAO.getBrokerCommissionSummary(brokerId, {
        godownId: q.godown_id,
        status: q.status,
        fromDate: q.from_date,
        toDate: q.to_date,
      });

      return ResponseHandler.success(res, summary, 'Broker commission summary retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const brokerData = validate<CreateBrokerDTO>(createBrokerSchema, req.body);
      const verifyBank = brokerData.verify_bank === true;
      if (verifyBank && !req.user?.userId) {
        throw new ValidationError('verify_bank requires an authenticated user');
      }

      const { verify_bank: _verifyBank, ...brokerPayload } = brokerData;

      // Get first contact person for validation and user creation
      const firstContactPerson = brokerPayload.contact_persons[0];
      if (!firstContactPerson || !firstContactPerson.phones || firstContactPerson.phones.length === 0) {
        throw new ValidationError('At least one contact person with a phone number is required');
      }
      const primaryEmail = firstContactPerson.emails?.[0]?.trim() || null;
      const primaryPhone = firstContactPerson.phones[0];

      // Check if email already exists in brokers (only if email is provided)
      if (primaryEmail) {
        const emailExists = await brokerDAO.emailExists(primaryEmail);
        if (emailExists) {
          throw new ConflictError('Email already exists');
        }

        // Check if email already exists in users
        const userEmailExists = await userDAO.emailExists(primaryEmail);
        if (userEmailExists) {
          throw new ConflictError('Email already exists in users');
        }
      }

      // Check if PAN already exists (if provided)
      if (brokerPayload.business_details.pan_number) {
        const panExists = await brokerDAO.panExists(brokerPayload.business_details.pan_number);
        if (panExists) {
          throw new ConflictError('PAN number already exists');
        }
      }

      // Check if Aadhaar already exists (if provided)
      if (brokerPayload.business_details.aadhaar_number) {
        const aadhaarExists = await brokerDAO.aadhaarExists(brokerPayload.business_details.aadhaar_number);
        if (aadhaarExists) {
          throw new ConflictError('Aadhaar number already exists');
        }
      }

      // Check if GST already exists (if provided)
      if (brokerPayload.business_details.gst_number) {
        const gstExists = await brokerDAO.gstExists(brokerPayload.business_details.gst_number);
        if (gstExists) {
          throw new ConflictError('GST number already exists');
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
          user_type: 'broker' as const,
          is_active: brokerPayload.is_active !== undefined ? brokerPayload.is_active : true,
          created_by: req.user?.userId,
        };

        try {
          user = await userDAO.create(userData);
        } catch (userError: any) {
          // Check if it's a duplicate email/username error
          if (userError?.code === '23505' || userError?.message?.includes('already exists')) {
            throw new ConflictError('Email or username already exists. Please use a different email.');
          }
          throw new InternalServerError('Failed to create user account for broker. Please try again.');
        }
      }

      // Create broker with user_id (or undefined if no email)
      const brokerWithUser = {
        ...brokerPayload,
        user_id: user?.id,
        created_by: req.user?.userId,
      };

      let broker;
      try {
        broker = await brokerDAO.create(brokerWithUser);
      } catch (dbError: any) {
        // If broker creation fails and we created a user, we should ideally rollback
        // For now, log the error and provide a clear message
        if (user) {
          // User was created but broker creation failed - this is a data inconsistency
          // In production, you might want to delete the user or use a transaction
          throw new InternalServerError('Broker creation failed after user account was created. Please contact support.');
        }
        // Check for database constraint violations
        if (dbError?.code === '23505') {
          throw new ConflictError('A broker with this information already exists');
        }
        throw new InternalServerError('Failed to create broker. Please try again.');
      }

      if (verifyBank && broker.bank_details) {
        try {
          await tryVerifyBankOnCreate(broker.id, broker.bank_details, req.user?.userId);
          const refreshed = await brokerDAO.findById(broker.id);
          return ResponseHandler.created(
            res,
            toBrokerResponse(refreshed ?? broker),
            'Broker created successfully',
            { verification_message: BANK_VERIFY_SUCCESS_MESSAGE }
          );
        } catch (verifyErr) {
          const errMsg = verificationErrorFromUnknown(verifyErr);
          logger.warn('Bank verification failed after broker create (lenient)', {
            brokerId: broker.id,
            error: errMsg,
          });
          await brokerDAO.setBankVerificationError(broker.id, errMsg);
          const refreshed = await brokerDAO.findById(broker.id);
          return ResponseHandler.created(
            res,
            toBrokerResponse(refreshed ?? broker),
            LENIENT_BANK_VERIFY_FAIL_MESSAGE,
            { verification_error: errMsg }
          );
        }
      }

      return ResponseHandler.created(res, toBrokerResponse(broker), 'Broker created successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const brokerData = validate<UpdateBrokerDTO>(updateBrokerSchema, req.body);

      // Check if broker exists
      const existingBroker = await brokerDAO.findById(id);
      if (!existingBroker) {
        throw new NotFoundError('Broker not found');
      }

      // Check if email already exists (if contact_persons is being updated with an email)
      if (brokerData.contact_persons?.[0]?.emails?.[0]) {
        const emailExists = await brokerDAO.emailExists(brokerData.contact_persons[0].emails[0], id);
        if (emailExists) {
          throw new ConflictError('Email already exists');
        }
      }

      // Check if PAN already exists (if being updated)
      if (brokerData.business_details?.pan_number) {
        const panExists = await brokerDAO.panExists(brokerData.business_details.pan_number, id);
        if (panExists) {
          throw new ConflictError('PAN number already exists');
        }
      }

      // Check if Aadhaar already exists (if being updated)
      if (brokerData.business_details?.aadhaar_number) {
        const aadhaarExists = await brokerDAO.aadhaarExists(brokerData.business_details.aadhaar_number, id);
        if (aadhaarExists) {
          throw new ConflictError('Aadhaar number already exists');
        }
      }

      // Check if GST already exists (if being updated)
      if (brokerData.business_details?.gst_number) {
        const gstExists = await brokerDAO.gstExists(brokerData.business_details.gst_number, id);
        if (gstExists) {
          throw new ConflictError('GST number already exists');
        }
      }

      // Set updated_by from authenticated user
      if (req.user) {
        brokerData.updated_by = req.user.userId;
      }

      let broker;
      try {
        broker = await brokerDAO.update(id, brokerData);
        if (!broker) {
          throw new NotFoundError('Broker not found after update');
        }
      } catch (dbError: any) {
        if (dbError?.code === '23505') {
          throw new ConflictError('A broker with this information already exists');
        }
        if (dbError instanceof NotFoundError) {
          throw dbError;
        }
        throw new InternalServerError('Failed to update broker. Please try again.');
      }

      return ResponseHandler.success(res, toBrokerResponse(broker), 'Broker updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      // Check if broker exists
      const broker = await brokerDAO.findById(id);
      if (!broker) {
        throw new NotFoundError('Broker not found');
      }

      try {
        await brokerDAO.delete(id);
      } catch (dbError: any) {
        // Check for foreign key constraint violations (broker might be referenced elsewhere)
        if (dbError?.code === '23503') {
          throw new ConflictError('Cannot delete broker. It is being used in other records.');
        }
        throw new InternalServerError('Failed to delete broker. Please try again.');
      }

      return ResponseHandler.success(res, null, 'Broker deleted successfully');
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
      let panData;
      try {
        panData = await gstLookupService.lookupPAN(panNumber);
      } catch (apiError: any) {
        if (apiError?.message?.includes('not found') || apiError?.statusCode === 404) {
          throw new NotFoundError('PAN number not found. Please verify the PAN number and try again.');
        }
        throw new InternalServerError('Failed to fetch PAN details. Please try again later.');
      }

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
   * Lookup Aadhaar Number and validate format
   * NOTE: Aadhaar lookup APIs are not publicly available, so this only validates format
   */
  async lookupAadhaar(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const aadhaarNumber = req.query.aadhaar_number as string;

      if (!aadhaarNumber) {
        throw new ValidationError('Aadhaar number is required');
      }

      // Validate Aadhaar format
      if (!gstLookupService.validateAadhaarFormat(aadhaarNumber)) {
        throw new ValidationError('Invalid Aadhaar number format. Expected format: 12 digits (not starting with 0 or 1)');
      }

      // Check if Aadhaar already exists
      const aadhaarExists = await brokerDAO.aadhaarExists(aadhaarNumber);
      if (aadhaarExists) {
        return ResponseHandler.success(res, {
          is_valid: true,
          already_exists: true,
          message: 'Aadhaar number is valid but already exists in system'
        }, 'Aadhaar number validation completed');
      }

      return ResponseHandler.success(res, {
        is_valid: true,
        already_exists: false,
        message: 'Aadhaar number is valid and available'
      }, 'Aadhaar number validation completed');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Quick create broker from PAN number
   * Fetches PAN details and creates broker with additional required input
   */
  async createFromPAN(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      // Validate required fields (PAN gives less info, so we need more input)
      const quickCreateSchema = Joi.object({
        pan_number: Joi.string().required().length(10).uppercase().messages({
          'string.length': 'PAN number must be exactly 10 characters',
          'any.required': 'PAN number is required'
        }),
        business_name: Joi.string().optional().min(2).max(255),
        contact_persons: Joi.array().items(
          Joi.object({
            name: Joi.string().required().min(2).max(255).messages({
              'any.required': 'Contact person name is required',
              'string.min': 'Contact person name must be at least 2 characters'
            }),
            phones: Joi.array().items(Joi.string().max(20)).required().min(1).messages({
              'any.required': 'At least one phone number is required',
              'array.min': 'At least one phone number is required'
            }),
            emails: Joi.array().items(Joi.string().email().allow('', null)).optional()
          })
        ).required().min(1).messages({
          'any.required': 'At least one contact person is required',
          'array.min': 'At least one contact person is required'
        }),
        address: Joi.object({
          street: Joi.string().required().max(255).messages({
            'any.required': 'Street address is required'
          }),
          city: Joi.string().required().max(100).messages({
            'any.required': 'City is required'
          }),
          state: Joi.string().required().max(100).messages({
            'any.required': 'State is required'
          }),
          pincode: Joi.string().required().allow('').max(10),
          country: Joi.string().required().max(100).messages({
            'any.required': 'Country is required'
          }),
        }).required().messages({
          'any.required': 'Address is required'
        }),
        type: Joi.string().required().valid('purchase', 'sale', 'both').messages({
          'any.required': 'Broker type is required',
          'any.only': 'Type must be one of: purchase, sale, both'
        }),
        broker_details: Joi.object({
          commission_rate: Joi.number().optional().min(0).max(100).messages({
            'number.min': 'Commission rate must be between 0 and 100',
            'number.max': 'Commission rate must be between 0 and 100'
          }),
          specialization: Joi.string().optional().allow(null, '').max(255),
          experience_years: Joi.string().optional().allow(null, '').max(100),
        }).optional(),
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
        contact_persons: CreateBrokerDTO['contact_persons'];
        address: CreateBrokerDTO['address'];
        type: BrokerType;
        broker_details?: CreateBrokerDTO['broker_details'];
        bank_details?: BankDetails;
        verify_bank?: boolean;
      };
      const {
        pan_number,
        business_name,
        contact_persons,
        address,
        type,
        broker_details,
        bank_details,
        verify_bank,
      } = body;
      const verifyBank = verify_bank === true;
      if (verifyBank && !req.user?.userId) {
        throw new ValidationError('verify_bank requires an authenticated user');
      }

      // Validate PAN format
      if (!gstLookupService.validatePANFormat(pan_number)) {
        throw new ValidationError('Invalid PAN number format');
      }

      // Check if PAN already exists
      const panExists = await brokerDAO.panExists(pan_number);
      if (panExists) {
        throw new ConflictError('PAN number already exists');
      }

      // Get first contact person for email check
      const firstContactPerson = contact_persons[0];
      const primaryEmail = firstContactPerson.emails?.[0];

      // Check if email already exists (only if email is provided)
      if (primaryEmail) {
        const emailExists = await brokerDAO.emailExists(primaryEmail);
        if (emailExists) {
          throw new ConflictError('Email already exists');
        }
      }

      // Fetch PAN details
      let panData;
      try {
        panData = await gstLookupService.lookupPAN(pan_number);
      } catch (apiError: any) {
        if (apiError?.message?.includes('not found') || apiError?.statusCode === 404) {
          throw new NotFoundError('PAN number not found. Please verify the PAN number and try again.');
        }
        throw new InternalServerError('Failed to fetch PAN details. Please try again later.');
      }
      const mappedData = gstLookupService.mapPANToBusinessData(panData);

      // Map business_type to only 'individual' or 'company' (partnership/llp -> company)
      let businessType: 'individual' | 'company' = 'company';
      if (mappedData.business_details.business_type === 'individual') {
        businessType = 'individual';
      }

      // Create broker with fetched + provided data
      const brokerData: CreateBrokerDTO = {
        business_name: business_name || mappedData.business_name,
        contact_persons,
        address,
        business_details: {
          ...mappedData.business_details,
          pan_number,
          business_type: businessType,
        },
        broker_details: broker_details ?? undefined,
        bank_details: bank_details ?? undefined,
        type,
        is_active: true,
        created_by: req.user?.userId,
      };

      let broker;
      try {
        broker = await brokerDAO.create(brokerData);
      } catch (dbError: any) {
        if (dbError?.code === '23505') {
          throw new ConflictError('A broker with this information already exists');
        }
        throw new InternalServerError('Failed to create broker. Please try again.');
      }

      if (verifyBank && broker.bank_details) {
        try {
          await tryVerifyBankOnCreate(broker.id, broker.bank_details, req.user?.userId);
          const refreshed = await brokerDAO.findById(broker.id);
          return ResponseHandler.created(
            res,
            toBrokerResponse(refreshed ?? broker),
            'Broker created from PAN successfully',
            { verification_message: BANK_VERIFY_SUCCESS_MESSAGE }
          );
        } catch (verifyErr) {
          const errMsg = verificationErrorFromUnknown(verifyErr);
          logger.warn('Bank verification failed after PAN broker create (lenient)', {
            brokerId: broker.id,
            error: errMsg,
          });
          await brokerDAO.setBankVerificationError(broker.id, errMsg);
          const refreshed = await brokerDAO.findById(broker.id);
          return ResponseHandler.created(
            res,
            toBrokerResponse(refreshed ?? broker),
            LENIENT_BANK_VERIFY_FAIL_MESSAGE,
            { verification_error: errMsg }
          );
        }
      }

      return ResponseHandler.created(
        res,
        toBrokerResponse(broker),
        'Broker created from PAN successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Quick create broker from GST number (for company brokers)
   * Fetches GST details and creates broker with additional required input
   */
  async createFromGST(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const quickCreateSchema = Joi.object({
        gst_number: Joi.string().required().length(15).uppercase().messages({
          'string.length': 'GST number must be exactly 15 characters',
          'any.required': 'GST number is required'
        }),
        contact_persons: Joi.array().items(
          Joi.object({
            name: Joi.string().required().min(2).max(255).messages({
              'any.required': 'Contact person name is required',
              'string.min': 'Contact person name must be at least 2 characters'
            }),
            phones: Joi.array().items(Joi.string().max(20)).required().min(1).messages({
              'any.required': 'At least one phone number is required',
              'array.min': 'At least one phone number is required'
            }),
            emails: Joi.array().items(Joi.string().email().allow('', null)).optional()
          })
        ).required().min(1).messages({
          'any.required': 'At least one contact person is required',
          'array.min': 'At least one contact person is required'
        }),
        type: Joi.string().required().valid('purchase', 'sale', 'both').messages({
          'any.required': 'Broker type is required',
          'any.only': 'Type must be one of: purchase, sale, both'
        }),
        broker_details: Joi.object({
          commission_rate: Joi.number().optional().min(0).max(100).messages({
            'number.min': 'Commission rate must be between 0 and 100',
            'number.max': 'Commission rate must be between 0 and 100'
          }),
          specialization: Joi.string().optional().allow(null, '').max(255),
          experience_years: Joi.string().optional().allow(null, '').max(100),
        }).optional(),
        verify_bank: Joi.boolean().optional(),
        bank_details: Joi.when('verify_bank', {
          is: true,
          then: bankDetailsForVerifySchema.required(),
          otherwise: Joi.object().optional(),
        }),
      });

      const body = validate(quickCreateSchema, req.body) as {
        gst_number: string;
        contact_persons: CreateBrokerDTO['contact_persons'];
        type: BrokerType;
        broker_details?: CreateBrokerDTO['broker_details'];
        bank_details?: BankDetails;
        verify_bank?: boolean;
      };
      const { gst_number, contact_persons, type, broker_details, bank_details, verify_bank } = body;
      const verifyBank = verify_bank === true;
      if (verifyBank && !req.user?.userId) {
        throw new ValidationError('verify_bank requires an authenticated user');
      }

      // Validate GST format
      if (!gstLookupService.validateGSTFormat(gst_number)) {
        throw new ValidationError('Invalid GST number format');
      }

      // Check if GST already exists
      const gstExists = await brokerDAO.gstExists(gst_number);
      if (gstExists) {
        throw new ConflictError('GST number already exists');
      }

      // Get first contact person for email check
      const firstContactPerson = contact_persons[0];
      const primaryEmail = firstContactPerson.emails?.[0];

      // Check if email already exists (only if email is provided)
      if (primaryEmail) {
        const emailExists = await brokerDAO.emailExists(primaryEmail);
        if (emailExists) {
          throw new ConflictError('Email already exists');
        }
      }

      // Fetch GST details
      let gstData;
      try {
        gstData = await gstLookupService.lookupGST(gst_number);
      } catch (apiError: any) {
        if (apiError?.message?.includes('not found') || apiError?.statusCode === 404) {
          throw new NotFoundError('GST number not found. Please verify the GST number and try again.');
        }
        throw new InternalServerError('Failed to fetch GST details. Please try again later.');
      }
      const mappedData = gstLookupService.mapGSTToBusinessData(gstData);

      // Determine business type from GST data
      // For brokers, only 'individual' and 'company' are allowed
      // Map 'partnership' and 'llp' to 'company'
      let businessType: 'individual' | 'company' = 'company';
      if (mappedData.business_details.business_type === 'individual') {
        businessType = 'individual';
      } else {
        // All other types (company, partnership, llp) map to 'company'
        businessType = 'company';
      }

      // Create broker with fetched + provided data
      const brokerData: CreateBrokerDTO = {
        business_name: mappedData.business_name,
        contact_persons,
        address: mappedData.address,
        business_details: {
          gst_number,
          pan_number: mappedData.business_details.pan_number, // PAN is embedded in GST
          business_type: businessType,
        },
        broker_details: broker_details ?? undefined,
        bank_details: bank_details ?? undefined,
        type,
        is_active: true,
        created_by: req.user?.userId,
      };

      let broker;
      try {
        broker = await brokerDAO.create(brokerData);
      } catch (dbError: any) {
        if (dbError?.code === '23505') {
          throw new ConflictError('A broker with this information already exists');
        }
        throw new InternalServerError('Failed to create broker. Please try again.');
      }

      if (verifyBank && broker.bank_details) {
        try {
          await tryVerifyBankOnCreate(broker.id, broker.bank_details, req.user?.userId);
          const refreshed = await brokerDAO.findById(broker.id);
          return ResponseHandler.created(
            res,
            toBrokerResponse(refreshed ?? broker),
            'Broker created from GST successfully',
            { verification_message: BANK_VERIFY_SUCCESS_MESSAGE }
          );
        } catch (verifyErr) {
          const errMsg = verificationErrorFromUnknown(verifyErr);
          logger.warn('Bank verification failed after GST broker create (lenient)', {
            brokerId: broker.id,
            error: errMsg,
          });
          await brokerDAO.setBankVerificationError(broker.id, errMsg);
          const refreshed = await brokerDAO.findById(broker.id);
          return ResponseHandler.created(
            res,
            toBrokerResponse(refreshed ?? broker),
            LENIENT_BANK_VERIFY_FAIL_MESSAGE,
            { verification_error: errMsg }
          );
        }
      }

      return ResponseHandler.created(
        res,
        toBrokerResponse(broker),
        'Broker created from GST successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Confirms stored bank_details for this broker via Surepass and persists verification metadata.
   * POST after the client has saved account + IFSC on the broker (or uses existing saved values).
   */
  async confirmBankVerification(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      if (!req.user?.userId) {
        throw new UnauthorizedError('Authentication required');
      }

      const broker = await brokerDAO.findById(id);
      if (!broker) {
        throw new NotFoundError('Broker not found');
      }

      const bd = broker.bank_details;
      const accountDigits = (bd?.account_number ?? '').replace(/\D/g, '');
      const ifsc = (bd?.ifsc_code ?? '').trim().toUpperCase();

      if (!bd || accountDigits.length < 9 || accountDigits.length > 18) {
        throw new ValidationError(
          'Broker must have a valid bank account number (9–18 digits) in bank_details before confirmation'
        );
      }
      if (!ifsc) {
        throw new ValidationError('Broker must have IFSC in bank_details before confirmation');
      }

      const enteredName = bd.account_holder_name?.trim();
      if (!enteredName) {
        throw new ValidationError(
          'Broker must have account_holder_name in bank_details before confirmation'
        );
      }

      const verificationResult = await gstLookupService.verifyBankAccount(accountDigits, ifsc);
      assertEnteredAccountHolderMatchesBankRecord(enteredName, verificationResult.account_holder_name);

      const updated = await brokerDAO.markBankDetailsVerified(id, req.user.userId);
      if (!updated) {
        throw new NotFoundError('Broker not found');
      }

      return ResponseHandler.success(res, toBrokerResponse(updated), 'Bank details verified and saved');
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
      let verificationResult;
      try {
        verificationResult = await gstLookupService.verifyBankAccount(
          id_number.trim(),
          ifsc.trim()
        );
      } catch (apiError: any) {
        if (apiError?.message?.includes('invalid') || apiError?.message?.includes('not found')) {
          throw new ValidationError('Invalid bank account details. Please verify the account number and IFSC code.');
        }
        throw new InternalServerError('Failed to verify bank account. Please try again later.');
      }

      return ResponseHandler.success(res, verificationResult, 'Bank account verified successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const brokerController = new BrokerController();
