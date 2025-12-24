import { Response, NextFunction } from 'express';
import { vehicleDAO } from '../dao/vehicle.dao';
import { ResponseHandler } from '../utils/response';
import { validate, createVehicleSchema, updateVehicleSchema, verifyVehicleSchema, uuidSchema } from '../utils/validators';
import { NotFoundError, ConflictError } from '../utils/errors';
import { CreateVehicleDTO, UpdateVehicleDTO, VehicleResponse } from '../models/vehicle.model';
import { AuthRequest } from '../middleware/auth.middleware';
import { gstLookupService } from '../services/gst-lookup.service';

export class VehicleController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const transporterId = req.query.transporter_id as string | undefined;
      const isActive = req.query.is_active === 'true' ? true : req.query.is_active === 'false' ? false : undefined;

      const vehicles = await vehicleDAO.findAll(transporterId, isActive);

      const vehicleResponses: VehicleResponse[] = vehicles.map((vehicle) => ({
        id: vehicle.id,
        vehicle_number: vehicle.vehicle_number,
        rc_number: vehicle.rc_number,
        owner_name: vehicle.owner_name,
        vehicle_class: vehicle.vehicle_class,
        fuel_type: vehicle.fuel_type,
        maker_model: vehicle.maker_model,
        registration_date: vehicle.registration_date?.toISOString().split('T')[0] || null,
        insurance_validity: vehicle.insurance_validity?.toISOString().split('T')[0] || null,
        fitness_validity: vehicle.fitness_validity?.toISOString().split('T')[0] || null,
        permit_validity: vehicle.permit_validity?.toISOString().split('T')[0] || null,
        challan_details: vehicle.challan_details,
        transporter_ids: vehicle.transporter_ids,
        is_verified: vehicle.is_verified,
        verified_at: vehicle.verified_at?.toISOString() || null,
        is_active: vehicle.is_active,
        created_at: vehicle.created_at.toISOString(),
        updated_at: vehicle.updated_at.toISOString(),
      }));

      return ResponseHandler.success(res, vehicleResponses);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      const vehicle = await vehicleDAO.findById(id);
      if (!vehicle) {
        throw new NotFoundError('Vehicle not found');
      }

      const vehicleResponse: VehicleResponse = {
        id: vehicle.id,
        vehicle_number: vehicle.vehicle_number,
        rc_number: vehicle.rc_number,
        owner_name: vehicle.owner_name,
        vehicle_class: vehicle.vehicle_class,
        fuel_type: vehicle.fuel_type,
        maker_model: vehicle.maker_model,
        registration_date: vehicle.registration_date?.toISOString().split('T')[0] || null,
        insurance_validity: vehicle.insurance_validity?.toISOString().split('T')[0] || null,
        fitness_validity: vehicle.fitness_validity?.toISOString().split('T')[0] || null,
        permit_validity: vehicle.permit_validity?.toISOString().split('T')[0] || null,
        challan_details: vehicle.challan_details,
        transporter_ids: vehicle.transporter_ids,
        is_verified: vehicle.is_verified,
        verified_at: vehicle.verified_at?.toISOString() || null,
        is_active: vehicle.is_active,
        created_at: vehicle.created_at.toISOString(),
        updated_at: vehicle.updated_at.toISOString(),
      };

      return ResponseHandler.success(res, vehicleResponse);
    } catch (error) {
      next(error);
    }
  }

  async getByVehicleNumber(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const vehicleNumber = req.params.vehicleNumber.toUpperCase().trim();

      const vehicle = await vehicleDAO.findByVehicleNumber(vehicleNumber);
      if (!vehicle) {
        throw new NotFoundError('Vehicle not found');
      }

      const vehicleResponse: VehicleResponse = {
        id: vehicle.id,
        vehicle_number: vehicle.vehicle_number,
        rc_number: vehicle.rc_number,
        owner_name: vehicle.owner_name,
        vehicle_class: vehicle.vehicle_class,
        fuel_type: vehicle.fuel_type,
        maker_model: vehicle.maker_model,
        registration_date: vehicle.registration_date?.toISOString().split('T')[0] || null,
        insurance_validity: vehicle.insurance_validity?.toISOString().split('T')[0] || null,
        fitness_validity: vehicle.fitness_validity?.toISOString().split('T')[0] || null,
        permit_validity: vehicle.permit_validity?.toISOString().split('T')[0] || null,
        challan_details: vehicle.challan_details,
        transporter_ids: vehicle.transporter_ids,
        is_verified: vehicle.is_verified,
        verified_at: vehicle.verified_at?.toISOString() || null,
        is_active: vehicle.is_active,
        created_at: vehicle.created_at.toISOString(),
        updated_at: vehicle.updated_at.toISOString(),
      };

      return ResponseHandler.success(res, vehicleResponse);
    } catch (error) {
      next(error);
    }
  }

  async verifyVehicle(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { vehicle_number } = validate<{ vehicle_number: string }>(verifyVehicleSchema, req.body);

      // Call Surepass API to verify vehicle
      const verificationResult = await gstLookupService.verifyVehicleRC(vehicle_number);

      return ResponseHandler.success(res, verificationResult, 'Vehicle verified successfully');
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const vehicleData = validate<CreateVehicleDTO>(createVehicleSchema, req.body);

      // Check if vehicle already exists
      const exists = await vehicleDAO.vehicleNumberExists(vehicleData.vehicle_number);
      if (exists) {
        throw new ConflictError('Vehicle number already exists');
      }

      // Set created_by from authenticated user
      if (req.user) {
        vehicleData.created_by = req.user.userId;
      }

      const createdVehicle = await vehicleDAO.create(vehicleData);

      const vehicleResponse: VehicleResponse = {
        id: createdVehicle.id,
        vehicle_number: createdVehicle.vehicle_number,
        rc_number: createdVehicle.rc_number,
        owner_name: createdVehicle.owner_name,
        vehicle_class: createdVehicle.vehicle_class,
        fuel_type: createdVehicle.fuel_type,
        maker_model: createdVehicle.maker_model,
        registration_date: createdVehicle.registration_date?.toISOString().split('T')[0] || null,
        insurance_validity: createdVehicle.insurance_validity?.toISOString().split('T')[0] || null,
        fitness_validity: createdVehicle.fitness_validity?.toISOString().split('T')[0] || null,
        permit_validity: createdVehicle.permit_validity?.toISOString().split('T')[0] || null,
        challan_details: createdVehicle.challan_details,
        transporter_ids: createdVehicle.transporter_ids,
        is_verified: createdVehicle.is_verified,
        verified_at: createdVehicle.verified_at?.toISOString() || null,
        is_active: createdVehicle.is_active,
        created_at: createdVehicle.created_at.toISOString(),
        updated_at: createdVehicle.updated_at.toISOString(),
      };

      return ResponseHandler.created(res, vehicleResponse, 'Vehicle created successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const vehicleData = validate<UpdateVehicleDTO>(updateVehicleSchema, req.body);

      // Set updated_by from authenticated user
      if (req.user) {
        vehicleData.updated_by = req.user.userId;
      }

      const updatedVehicle = await vehicleDAO.update(id, vehicleData);
      if (!updatedVehicle) {
        throw new NotFoundError('Vehicle not found');
      }

      const vehicleResponse: VehicleResponse = {
        id: updatedVehicle.id,
        vehicle_number: updatedVehicle.vehicle_number,
        rc_number: updatedVehicle.rc_number,
        owner_name: updatedVehicle.owner_name,
        vehicle_class: updatedVehicle.vehicle_class,
        fuel_type: updatedVehicle.fuel_type,
        maker_model: updatedVehicle.maker_model,
        registration_date: updatedVehicle.registration_date?.toISOString().split('T')[0] || null,
        insurance_validity: updatedVehicle.insurance_validity?.toISOString().split('T')[0] || null,
        fitness_validity: updatedVehicle.fitness_validity?.toISOString().split('T')[0] || null,
        permit_validity: updatedVehicle.permit_validity?.toISOString().split('T')[0] || null,
        challan_details: updatedVehicle.challan_details,
        transporter_ids: updatedVehicle.transporter_ids,
        is_verified: updatedVehicle.is_verified,
        verified_at: updatedVehicle.verified_at?.toISOString() || null,
        is_active: updatedVehicle.is_active,
        created_at: updatedVehicle.created_at.toISOString(),
        updated_at: updatedVehicle.updated_at.toISOString(),
      };

      return ResponseHandler.success(res, vehicleResponse, 'Vehicle updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      const deleted = await vehicleDAO.delete(id);
      if (!deleted) {
        throw new NotFoundError('Vehicle not found');
      }

      return ResponseHandler.success(res, null, 'Vehicle deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const vehicleController = new VehicleController();

