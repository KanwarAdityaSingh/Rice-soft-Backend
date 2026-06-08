import { Response, NextFunction } from 'express';
import { driverDAO } from '../dao/driver.dao';
import { ResponseHandler } from '../utils/response';
import {
  validate,
  createDriverSchema,
  updateDriverSchema,
  uuidSchema,
  verifyDriverSchema,
} from '../utils/validators';
import { NotFoundError, ConflictError } from '../utils/errors';
import { CreateDriverDTO, DriverResponse, UpdateDriverDTO } from '../models/driver.model';
import { AuthRequest } from '../middleware/auth.middleware';
import { gstLookupService } from '../services/gst-lookup.service';
import { kycPersistenceService } from '../services/kyc-persistence.service';

function dateOnlyFromDb(value: Date | string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }
  return value.toISOString().split('T')[0];
}

function toResponse(driver: {
  id: string;
  license_number: string;
  phone: string;
  name: string | null;
  date_of_birth: Date | string | null;
  license_expires_at: Date | string | null;
  address: string | null;
  is_verified: boolean;
  verified_at: Date | null;
  verification_details: unknown;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}): DriverResponse {
  return {
    id: driver.id,
    license_number: driver.license_number,
    phone: driver.phone,
    name: driver.name,
    date_of_birth: dateOnlyFromDb(driver.date_of_birth),
    license_expires_at: dateOnlyFromDb(driver.license_expires_at),
    address: driver.address,
    is_verified: driver.is_verified,
    verified_at: driver.verified_at?.toISOString() || null,
    verification_details: (driver.verification_details as DriverResponse['verification_details']) ?? null,
    is_active: driver.is_active,
    created_at: driver.created_at.toISOString(),
    updated_at: driver.updated_at.toISOString(),
  };
}

export class DriverController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const includeInactive = req.query.include_inactive === 'true';
      const drivers = await driverDAO.findAll(includeInactive);
      return ResponseHandler.success(res, drivers.map(toResponse));
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const driver = await driverDAO.findById(id);
      if (!driver) {
        throw new NotFoundError('Driver not found');
      }
      return ResponseHandler.success(res, toResponse(driver));
    } catch (error) {
      next(error);
    }
  }

  async getByLicenseNumber(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const raw = req.params.licenseNumber;
      if (!raw || typeof raw !== 'string') {
        throw new NotFoundError('Driver not found');
      }
      const driver = await driverDAO.findByLicenseNumber(decodeURIComponent(raw));
      if (!driver) {
        throw new NotFoundError('Driver not found');
      }
      return ResponseHandler.success(res, toResponse(driver));
    } catch (error) {
      next(error);
    }
  }

  async verifyDriver(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { license_number, dob } = validate<{ license_number: string; dob?: string }>(
        verifyDriverSchema,
        req.body
      );
      const envelope = await gstLookupService.verifyDrivingLicense(license_number, dob);

      const driverId = (req.body as { driver_id?: string }).driver_id;
      if (driverId) {
        await kycPersistenceService.saveDriverVerification(driverId, envelope);
      } else {
        const existing = await driverDAO.findByLicenseNumber(license_number);
        if (existing) {
          await kycPersistenceService.saveDriverVerification(existing.id, envelope);
        }
      }

      return ResponseHandler.success(
        res,
        { ...envelope.mapped, surepass_response: envelope.raw },
        'Driving licence verified successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const body = validate<CreateDriverDTO>(createDriverSchema, req.body);

      const exists = await driverDAO.licenseNumberExists(body.license_number);
      if (exists) {
        throw new ConflictError('Driving license number already exists');
      }

      if (req.user) {
        body.created_by = req.user.userId;
      }

      const created = await driverDAO.create(body);
      return ResponseHandler.created(res, toResponse(created), 'Driver created successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const body = validate<UpdateDriverDTO>(updateDriverSchema, req.body);

      const existing = await driverDAO.findById(id);
      if (!existing) {
        throw new NotFoundError('Driver not found');
      }

      if (body.license_number !== undefined) {
        const taken = await driverDAO.licenseNumberExists(body.license_number, id);
        if (taken) {
          throw new ConflictError('Driving license number already exists');
        }
      }

      if (req.user) {
        body.updated_by = req.user.userId;
      }

      const updated = await driverDAO.update(id, body);
      if (!updated) {
        throw new NotFoundError('Driver not found');
      }
      return ResponseHandler.success(res, toResponse(updated), 'Driver updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      const existing = await driverDAO.findById(id);
      if (!existing) {
        throw new NotFoundError('Driver not found');
      }

      await driverDAO.softDelete(id);
      return ResponseHandler.success(res, { id }, 'Driver deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const driverController = new DriverController();
