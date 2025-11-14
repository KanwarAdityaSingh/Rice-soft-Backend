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
} from '../utils/errors';
import { CreateTransporterDTO, UpdateTransporterDTO, TransporterResponse } from '../models/transporter.model';
import { AuthRequest } from '../middleware/auth.middleware';

export class TransporterController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const includeInactive = req.query.include_inactive === 'true';
      
      const transporters = await transporterDAO.findAll(includeInactive);

      const transporterResponses: TransporterResponse[] = transporters.map((transporter) => ({
        id: transporter.id,
        business_name: transporter.business_name,
        contact_person: transporter.contact_person,
        phone: transporter.phone,
        email: transporter.email,
        address: transporter.address,
        gst_number: transporter.gst_number,
        pan_number: transporter.pan_number,
        vehicle_numbers: transporter.vehicle_numbers,
        bank_details: transporter.bank_details,
        is_active: transporter.is_active,
        created_at: transporter.created_at.toISOString(),
        updated_at: transporter.updated_at.toISOString(),
      }));

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

      const transporterResponse: TransporterResponse = {
        id: transporter.id,
        business_name: transporter.business_name,
        contact_person: transporter.contact_person,
        phone: transporter.phone,
        email: transporter.email,
        address: transporter.address,
        gst_number: transporter.gst_number,
        pan_number: transporter.pan_number,
        vehicle_numbers: transporter.vehicle_numbers,
        bank_details: transporter.bank_details,
        is_active: transporter.is_active,
        created_at: transporter.created_at.toISOString(),
        updated_at: transporter.updated_at.toISOString(),
      };

      return ResponseHandler.success(res, transporterResponse);
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const transporterData = validate<CreateTransporterDTO>(createTransporterSchema, req.body);

      // Check if email already exists (only if email is provided)
      if (transporterData.email) {
        const emailExists = await transporterDAO.emailExists(transporterData.email);
        if (emailExists) {
          throw new ConflictError('Email already exists');
        }
      }

      // Set created_by from authenticated user
      if (req.user) {
        transporterData.created_by = req.user.userId;
      }

      const transporter = await transporterDAO.create(transporterData);

      const transporterResponse: TransporterResponse = {
        id: transporter.id,
        business_name: transporter.business_name,
        contact_person: transporter.contact_person,
        phone: transporter.phone,
        email: transporter.email,
        address: transporter.address,
        gst_number: transporter.gst_number,
        pan_number: transporter.pan_number,
        vehicle_numbers: transporter.vehicle_numbers,
        bank_details: transporter.bank_details,
        is_active: transporter.is_active,
        created_at: transporter.created_at.toISOString(),
        updated_at: transporter.updated_at.toISOString(),
      };

      return ResponseHandler.created(res, transporterResponse, 'Transporter created successfully');
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

      // Check for duplicate email if email is being updated
      if (transporterData.email && transporterData.email !== existingTransporter.email) {
        const emailExists = await transporterDAO.emailExists(transporterData.email, id);
        if (emailExists) {
          throw new ConflictError('Email already exists');
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

      const transporterResponse: TransporterResponse = {
        id: transporter.id,
        business_name: transporter.business_name,
        contact_person: transporter.contact_person,
        phone: transporter.phone,
        email: transporter.email,
        address: transporter.address,
        gst_number: transporter.gst_number,
        pan_number: transporter.pan_number,
        vehicle_numbers: transporter.vehicle_numbers,
        bank_details: transporter.bank_details,
        is_active: transporter.is_active,
        created_at: transporter.created_at.toISOString(),
        updated_at: transporter.updated_at.toISOString(),
      };

      return ResponseHandler.success(res, transporterResponse, 'Transporter updated successfully');
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
}

export const transporterController = new TransporterController();

