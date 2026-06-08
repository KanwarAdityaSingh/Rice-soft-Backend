import { Response, NextFunction } from 'express';
import { transporterDAO } from '../dao/transporter.dao';
import { ResponseHandler } from '../utils/response';
import {
  validate,
  createTransporterSchema,
  updateTransporterSchema,
  uuidSchema,
} from '../utils/validators';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
} from '../utils/errors';
import { CreateTransporterDTO, UpdateTransporterDTO, TransporterResponse, Transporter } from '../models/transporter.model';
import { AuthRequest } from '../middleware/auth.middleware';
import { gstLookupService } from '../services/gst-lookup.service';
import { parseEntityKycDetails } from '../utils/kyc-verification';

function toTransporterResponse(transporter: Transporter): TransporterResponse {
  return {
    id: transporter.id,
    business_name: transporter.business_name,
    contact_persons: transporter.contact_persons,
    address: transporter.address,
    gst_number: transporter.gst_number,
    pan_number: transporter.pan_number,
    aadhar_number: transporter.aadhar_number,
    transport_type: transporter.transport_type,
    vehicle_numbers: transporter.vehicle_numbers,
    vehicle_ids: transporter.vehicle_ids,
    bank_details: transporter.bank_details,
    is_active: transporter.is_active,
    created_at: transporter.created_at.toISOString(),
    updated_at: transporter.updated_at.toISOString(),
    kyc_verification_details: parseEntityKycDetails(transporter.kyc_verification_details),
  };
}

export class TransporterController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const includeInactive = req.query.include_inactive === 'true';
      
      const transporters = await transporterDAO.findAll(includeInactive);

      const transporterResponses: TransporterResponse[] = transporters.map(toTransporterResponse);

      return ResponseHandler.success(res, transporterResponses);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      const transporter = await transporterDAO.findById(id);
      if (!transporter) {
        throw new NotFoundError('Transporter not found');
      }

      return ResponseHandler.success(res, toTransporterResponse(transporter));
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const transporterData = validate<CreateTransporterDTO>(createTransporterSchema, req.body);

      // Check if email already exists (check all emails from contact_persons)
      for (const contactPerson of transporterData.contact_persons ?? []) {
        if (contactPerson.emails) {
          for (const email of contactPerson.emails) {
            if (email && email.trim() !== '') {
            const emailExists = await transporterDAO.emailExists(email);
        if (emailExists) {
              throw new ConflictError(`Email already exists: ${email}`);
            }
          }
          }
        }
      }

      // Check if GST number already exists (if provided)
      if (transporterData.gst_number) {
        const gstExists = await transporterDAO.gstExists(transporterData.gst_number);
        if (gstExists) {
          throw new ConflictError('GST number already exists');
        }
      }

      // Check if PAN number already exists (if provided)
      if (transporterData.pan_number) {
        const panExists = await transporterDAO.panExists(transporterData.pan_number);
        if (panExists) {
          throw new ConflictError('PAN number already exists');
        }
      }

      // Check if Aadhaar number already exists (if provided)
      if (transporterData.aadhar_number) {
        const aadharExists = await transporterDAO.aadharExists(transporterData.aadhar_number);
        if (aadharExists) {
          throw new ConflictError('Aadhaar number already exists');
        }
      }

      // Set created_by from authenticated user
      if (req.user) {
        transporterData.created_by = req.user.userId;
      }

      const transporter = await transporterDAO.create(transporterData);

      return ResponseHandler.created(res, toTransporterResponse(transporter), 'Transporter created successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const transporterData = validate<UpdateTransporterDTO>(updateTransporterSchema, req.body);

      // Check if transporter exists
      const existingTransporter = await transporterDAO.findById(id);
      if (!existingTransporter) {
        throw new NotFoundError('Transporter not found');
      }

      // Check for duplicate email if contact_persons is being updated
      if (transporterData.contact_persons) {
        for (const contactPerson of transporterData.contact_persons) {
          if (contactPerson.emails) {
            for (const email of contactPerson.emails) {
              if (email && email.trim() !== '') {
              // Only check if email is different from existing transporter's email
              if (email !== existingTransporter.email) {
                const emailExists = await transporterDAO.emailExists(email, id);
        if (emailExists) {
                  throw new ConflictError(`Email already exists: ${email}`);
                }
              }
            }
          }
          }
        }
      }

      // Check if GST number already exists (if being updated)
      if (transporterData.gst_number && transporterData.gst_number !== existingTransporter.gst_number) {
        const gstExists = await transporterDAO.gstExists(transporterData.gst_number, id);
        if (gstExists) {
          throw new ConflictError('GST number already exists');
        }
      }

      // Check if PAN number already exists (if being updated)
      if (transporterData.pan_number && transporterData.pan_number !== existingTransporter.pan_number) {
        const panExists = await transporterDAO.panExists(transporterData.pan_number, id);
        if (panExists) {
          throw new ConflictError('PAN number already exists');
        }
      }

      // Check if Aadhaar number already exists (if being updated)
      if (transporterData.aadhar_number && transporterData.aadhar_number !== existingTransporter.aadhar_number) {
        const aadharExists = await transporterDAO.aadharExists(transporterData.aadhar_number, id);
        if (aadharExists) {
          throw new ConflictError('Aadhaar number already exists');
        }
      }

      // Set updated_by from authenticated user
      if (req.user) {
        transporterData.updated_by = req.user.userId;
      }

      const transporter = await transporterDAO.update(id, transporterData);
      if (!transporter) {
        throw new NotFoundError('Transporter not found after update');
      }

      return ResponseHandler.success(res, toTransporterResponse(transporter), 'Transporter updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      const transporter = await transporterDAO.findById(id);
      if (!transporter) {
        throw new NotFoundError('Transporter not found');
      }

      const deleted = await transporterDAO.delete(id);
      if (!deleted) {
        throw new NotFoundError('Transporter not found after deletion');
      }

      return ResponseHandler.success(res, null, 'Transporter deleted successfully');
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
}

export const transporterController = new TransporterController();

