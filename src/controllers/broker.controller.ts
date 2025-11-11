import { Response, NextFunction } from 'express';
import { brokerDAO } from '../dao/broker.dao';
import { userDAO } from '../dao/user.dao';
import { ResponseHandler } from '../utils/response';
import {
  validate,
  createBrokerSchema,
  updateBrokerSchema,
  uuidSchema,
} from '../utils/validators';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
} from '../utils/errors';
import { CreateBrokerDTO, UpdateBrokerDTO, BrokerResponse, BrokerType } from '../models/broker.model';
import { AuthRequest } from '../middleware/auth.middleware';
import { gstLookupService } from '../services/gst-lookup.service';
import Joi from 'joi';

export class BrokerController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const includeInactive = req.query.include_inactive === 'true';
      const type = req.query.type as BrokerType | undefined;
      
      const brokers = await brokerDAO.findAll(includeInactive, type);

      const brokerResponses: BrokerResponse[] = brokers.map((broker) => ({
        id: broker.id,
        business_name: broker.business_name,
        contact_persons: broker.contact_persons,
        email: broker.email,
        phone: broker.phone,
        address: broker.address,
        business_details: broker.business_details,
        broker_details: broker.broker_details,
        type: broker.type,
        is_active: broker.is_active,
        created_at: broker.created_at.toISOString(),
        updated_at: broker.updated_at.toISOString(),
      }));

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

      const brokerResponse: BrokerResponse = {
        id: broker.id,
        business_name: broker.business_name,
        contact_persons: broker.contact_persons,
        email: broker.email,
        phone: broker.phone,
        address: broker.address,
        business_details: broker.business_details,
        broker_details: broker.broker_details,
        type: broker.type,
        is_active: broker.is_active,
        created_at: broker.created_at.toISOString(),
        updated_at: broker.updated_at.toISOString(),
      };

      return ResponseHandler.success(res, brokerResponse);
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const brokerData = validate<CreateBrokerDTO>(createBrokerSchema, req.body);

      // Check if email already exists in brokers
      const emailExists = await brokerDAO.emailExists(brokerData.email);
      if (emailExists) {
        throw new ConflictError('Email already exists');
      }

      // Check if email already exists in users
      const userEmailExists = await userDAO.emailExists(brokerData.email);
      if (userEmailExists) {
        throw new ConflictError('Email already exists in users');
      }

      // Check if PAN already exists (if provided)
      if (brokerData.business_details.pan_number) {
        const panExists = await brokerDAO.panExists(brokerData.business_details.pan_number);
        if (panExists) {
          throw new ConflictError('PAN number already exists');
        }
      }

      // Check if Aadhaar already exists (if provided)
      if (brokerData.business_details.aadhaar_number) {
        const aadhaarExists = await brokerDAO.aadhaarExists(brokerData.business_details.aadhaar_number);
        if (aadhaarExists) {
          throw new ConflictError('Aadhaar number already exists');
        }
      }

      // Generate username from first contact person (first part before space, lowercase, remove special chars)
      const firstContactPerson = brokerData.contact_persons && brokerData.contact_persons.length > 0 
        ? brokerData.contact_persons[0] 
        : null;
      
      if (!firstContactPerson) {
        throw new ValidationError('At least one contact person is required');
      }

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

      // Create user first
      const userData = {
        username: username,
        email: brokerData.email,
        password: 'defaultPassword123', // Default password, should be changed on first login
        full_name: firstContactPerson.name,
        phone: (firstContactPerson.phones && firstContactPerson.phones.length > 0) 
          ? firstContactPerson.phones[0] 
          : brokerData.phone,
        user_type: 'broker' as const,
        is_active: brokerData.is_active !== undefined ? brokerData.is_active : true,
        created_by: req.user?.userId,
      };

      let user;
      try {
        user = await userDAO.create(userData);
      } catch (userError) {
        console.error('User creation failed:', userError);
        throw new ConflictError('Failed to create user account for broker');
      }

      // Create broker with user_id
      const brokerWithUser = {
        ...brokerData,
        user_id: user.id,
        created_by: req.user?.userId,
      };

      const broker = await brokerDAO.create(brokerWithUser);

      const brokerResponse: BrokerResponse = {
        id: broker.id,
        business_name: broker.business_name,
        contact_persons: broker.contact_persons,
        email: broker.email,
        phone: broker.phone,
        address: broker.address,
        business_details: broker.business_details,
        broker_details: broker.broker_details,
        type: broker.type,
        is_active: broker.is_active,
        created_at: broker.created_at.toISOString(),
        updated_at: broker.updated_at.toISOString(),
      };

      return ResponseHandler.created(res, brokerResponse, 'Broker created successfully');
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

      // Check if email already exists (if being updated)
      if (brokerData.email) {
        const emailExists = await brokerDAO.emailExists(brokerData.email, id);
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

      // Set updated_by from authenticated user
      if (req.user) {
        brokerData.updated_by = req.user.userId;
      }

      const broker = await brokerDAO.update(id, brokerData);
      if (!broker) {
        throw new NotFoundError('Broker not found after update');
      }

      const brokerResponse: BrokerResponse = {
        id: broker.id,
        business_name: broker.business_name,
        contact_persons: broker.contact_persons,
        email: broker.email,
        phone: broker.phone,
        address: broker.address,
        business_details: broker.business_details,
        broker_details: broker.broker_details,
        type: broker.type,
        is_active: broker.is_active,
        created_at: broker.created_at.toISOString(),
        updated_at: broker.updated_at.toISOString(),
      };

      return ResponseHandler.success(res, brokerResponse, 'Broker updated successfully');
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

      await brokerDAO.delete(id);

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
      const { pan_number, business_name, contact_persons, email, phone, address, type, broker_details } = req.body;

      // Validate required fields (PAN gives less info, so we need more input)
      const quickCreateSchema = Joi.object({
        pan_number: Joi.string().required().length(10),
        business_name: Joi.string().optional().min(2).max(255),
        contact_persons: Joi.array().items(
          Joi.object({
            name: Joi.string().required().min(2).max(255),
            phones: Joi.array().items(Joi.string().max(20)).required().min(1)
          })
        ).required().min(1),
        email: Joi.string().required().email(),
        phone: Joi.string().required().max(20),
        address: Joi.object({
          street: Joi.string().required().max(255),
          city: Joi.string().required().max(100),
          state: Joi.string().required().max(100),
          pincode: Joi.string().required().allow('').max(10),
          country: Joi.string().required().max(100),
        }).required(),
        type: Joi.string().required().valid('purchase', 'sale', 'both'),
        broker_details: Joi.object({
          commission_rate: Joi.number().optional().min(0).max(100),
          specialization: Joi.string().optional().allow(null, '').max(255),
          experience_years: Joi.string().optional().allow(null, '').max(100),
        }).optional(),
      });

      validate(quickCreateSchema, req.body);

      // Validate PAN format
      if (!gstLookupService.validatePANFormat(pan_number)) {
        throw new ValidationError('Invalid PAN number format');
      }

      // Check if PAN already exists
      const panExists = await brokerDAO.panExists(pan_number);
      if (panExists) {
        throw new ConflictError('PAN number already exists');
      }

      // Check if email already exists
      const emailExists = await brokerDAO.emailExists(email);
      if (emailExists) {
        throw new ConflictError('Email already exists');
      }

      // Fetch PAN details
      const panData = await gstLookupService.lookupPAN(pan_number);
      const mappedData = gstLookupService.mapPANToBusinessData(panData);

      // Create broker with fetched + provided data
      const brokerData: CreateBrokerDTO = {
        business_name: business_name || mappedData.business_name,
        contact_persons,
        email,
        phone,
        address,
        business_details: {
          ...mappedData.business_details,
          pan_number,
        },
        broker_details: broker_details || null,
        type,
        is_active: true,
        created_by: req.user?.userId,
      };

      const broker = await brokerDAO.create(brokerData);

      const brokerResponse: BrokerResponse = {
        id: broker.id,
        business_name: broker.business_name,
        contact_persons: broker.contact_persons,
        email: broker.email,
        phone: broker.phone,
        address: broker.address,
        business_details: broker.business_details,
        broker_details: broker.broker_details,
        type: broker.type,
        is_active: broker.is_active,
        created_at: broker.created_at.toISOString(),
        updated_at: broker.updated_at.toISOString(),
      };

      return ResponseHandler.created(res, brokerResponse, 'Broker created from PAN successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const brokerController = new BrokerController();

