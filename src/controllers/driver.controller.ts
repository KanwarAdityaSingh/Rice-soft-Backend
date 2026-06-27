import { Response, NextFunction } from 'express';
import { driverDAO } from '../dao/driver.dao';
import { ResponseHandler } from '../utils/response';
import {
  validate,
  createDriverSchema,
  updateDriverSchema,
  uuidSchema,
  verifyDriverSchema,
  verifyDriverByIdSchema,
} from '../utils/validators';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors';
import { CreateDriverDTO, DriverResponse, UpdateDriverDTO } from '../models/driver.model';
import { resolveTransportDoeForCreate } from '../utils/driver-license';
import { AuthRequest } from '../middleware/auth.middleware';
import { gstLookupService } from '../services/gst-lookup.service';
import { kycPersistenceService } from '../services/kyc-persistence.service';
import { parseLicenseOcrUpload, drivingLicenseOcrPayload } from '../utils/license-ocr-request';

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
  transport_license_expires_at?: Date | string | null;
  father_or_husband_name?: string | null;
  state?: string | null;
  city_name?: string | null;
  address: string | null;
  pincode: string | null;
  gender: string | null;
  profile_image: string | null;
  vehicle_classes: string[];
  is_verified: boolean;
  verified_at: Date | null;
  verification_details: unknown;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}): DriverResponse {
  const licenseExpiresAt = dateOnlyFromDb(driver.license_expires_at);
  const transportExpiresAt = dateOnlyFromDb(driver.transport_license_expires_at ?? null);
  return {
    id: driver.id,
    license_number: driver.license_number,
    phone: driver.phone,
    name: driver.name,
    date_of_birth: dateOnlyFromDb(driver.date_of_birth),
    license_expires_at: licenseExpiresAt,
    doe: licenseExpiresAt,
    transport_license_expires_at: transportExpiresAt,
    transport_doe: transportExpiresAt,
    father_or_husband_name: driver.father_or_husband_name ?? null,
    state: driver.state ?? null,
    city_name: driver.city_name ?? null,
    address: driver.address,
    pincode: driver.pincode,
    gender: driver.gender,
    profile_image: driver.profile_image,
    vehicle_classes: driver.vehicle_classes ?? [],
    is_verified: driver.is_verified,
    verified_at: driver.verified_at?.toISOString() || null,
    verification_details: (driver.verification_details as DriverResponse['verification_details']) ?? null,
    is_active: driver.is_active,
    created_at: driver.created_at.toISOString(),
    updated_at: driver.updated_at.toISOString(),
  };
}

function driverLicenseVerifyPayload(
  mapped: Awaited<ReturnType<typeof gstLookupService.verifyDrivingLicense>>['mapped']
) {
  return {
    ...mapped,
    doe: mapped.date_of_expiry || null,
    transport_doe: mapped.transport_date_of_expiry || null,
  };
}

export class DriverController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const includeInactive = req.query.include_inactive === 'true';
      let isActive: boolean | undefined;
      if (includeInactive) {
        isActive = undefined;
      } else if (req.query.is_active === 'false') {
        isActive = false;
      } else {
        isActive = true;
      }

      let isVerified: boolean | undefined;
      if (req.query.is_verified === 'true') {
        isVerified = true;
      } else if (req.query.is_verified === 'false') {
        isVerified = false;
      }

      const drivers = await driverDAO.findAll({ includeInactive, isActive, isVerified });
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
      const body = validate<{
        license_number?: string;
        id_number?: string;
        dob?: string;
        date_of_birth?: string;
        driver_id?: string;
      }>(verifyDriverSchema, req.body);

      const license_number = body.license_number ?? body.id_number!;
      const dob = body.dob ?? body.date_of_birth;
      const envelope = await gstLookupService.verifyDrivingLicense(license_number, dob);

      let driver: DriverResponse | null = null;
      const driverId = body.driver_id;
      if (driverId) {
        const existing = await driverDAO.findById(driverId);
        if (!existing) {
          throw new NotFoundError('Driver not found');
        }
        await kycPersistenceService.saveDriverVerification(driverId, envelope);
        const updated = await driverDAO.findById(driverId);
        driver = updated ? toResponse(updated) : null;
      } else {
        const existing = await driverDAO.findByLicenseNumber(license_number);
        if (existing) {
          await kycPersistenceService.saveDriverVerification(existing.id, envelope);
          const updated = await driverDAO.findById(existing.id);
          driver = updated ? toResponse(updated) : null;
        }
      }

      return ResponseHandler.success(
        res,
        {
          ...driverLicenseVerifyPayload(envelope.mapped),
          surepass_response: envelope.raw,
          driver,
        },
        driver ? 'Driver verified and updated successfully' : 'Driving licence verified successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async ocrDriver(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { front, back, usePdf } = parseLicenseOcrUpload(req);
      const driverId = typeof req.body?.driver_id === 'string' ? req.body.driver_id.trim() : undefined;

      const envelope = await gstLookupService.ocrDrivingLicense({ front, back, usePdf });

      let driver: DriverResponse | null = null;
      if (driverId) {
        validate<string>(uuidSchema, driverId);
        const existing = await driverDAO.findById(driverId);
        if (!existing) {
          throw new NotFoundError('Driver not found');
        }

        const taken = await driverDAO.licenseNumberExists(envelope.mapped.license_number, driverId);
        if (taken) {
          throw new ConflictError('Driving license number already exists');
        }

        const updated = await driverDAO.update(driverId, {
          license_number: envelope.mapped.license_number,
          name: envelope.mapped.full_name,
          date_of_birth: envelope.mapped.date_of_birth || undefined,
          address: envelope.mapped.address || undefined,
          pincode: envelope.mapped.pincode || undefined,
          state: envelope.mapped.state || undefined,
          updated_by: req.user?.userId,
        });
        driver = updated ? toResponse(updated) : null;
      }

      return ResponseHandler.success(
        res,
        {
          ...drivingLicenseOcrPayload(envelope.mapped),
          surepass_response: envelope.raw,
          driver,
        },
        driver
          ? 'Driving licence scanned and driver updated successfully'
          : 'Driving licence scanned successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async verifyById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const body = validate<{
        license_number?: string;
        id_number?: string;
        dob?: string;
        date_of_birth?: string;
      }>(verifyDriverByIdSchema, req.body);

      const existing = await driverDAO.findById(id);
      if (!existing) {
        throw new NotFoundError('Driver not found');
      }

      const license_number = body.license_number ?? body.id_number ?? existing.license_number;
      const dob = body.dob ?? body.date_of_birth;
      const envelope = await gstLookupService.verifyDrivingLicense(license_number, dob);

      const verifiedLicense = envelope.mapped.license_number;
      if (
        verifiedLicense &&
        verifiedLicense !== existing.license_number &&
        (body.license_number || body.id_number)
      ) {
        throw new ValidationError(
          'Verified licence number does not match this driver record'
        );
      }

      await kycPersistenceService.saveDriverVerification(id, envelope);
      const updated = await driverDAO.findById(id);
      if (!updated) {
        throw new NotFoundError('Driver not found after verification');
      }

      return ResponseHandler.success(
        res,
        {
          ...driverLicenseVerifyPayload(envelope.mapped),
          surepass_response: envelope.raw,
          driver: toResponse(updated),
        },
        'Driver verified successfully'
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

      const transportDoe = resolveTransportDoeForCreate(body);
      let createExtras: { verification_error?: string; transport_doe_not_found?: boolean } | undefined;

      if (!transportDoe) {
        createExtras = {
          verification_error: 'Transport DOE not found',
          transport_doe_not_found: true,
        };
      } else if (!transportDoe.parsed) {
        throw new ValidationError(
          `transport_doe "${transportDoe.raw}" is not a valid date format (expected YYYY-MM-DD).`
        );
      } else {
        body.transport_license_expires_at = transportDoe.parsed;
      }

      const created = await driverDAO.create(body);
      return ResponseHandler.created(
        res,
        toResponse(created),
        'Driver created successfully',
        createExtras
      );
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
