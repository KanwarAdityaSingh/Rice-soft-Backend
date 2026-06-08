import { Response, NextFunction } from 'express';
import { ResponseHandler } from '../utils/response';
import { ValidationError } from '../utils/errors';
import { AuthRequest } from '../middleware/auth.middleware';
import { gstLookupService } from '../services/gst-lookup.service';
import { validate, verifyDriverSchema, rcChallanDetailsSchema } from '../utils/validators';
import type { RcChallanDetailsRequest } from '../services/gst-lookup.service';
import { parsePersistKycRequest, saveKycSnapshotForEntity } from '../utils/kyc-persist-request';

export class KycController {
  async validateAadhaar(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const aadhaarNumber = req.query.aadhaar_number as string;
      if (!aadhaarNumber) {
        throw new ValidationError('aadhaar_number is required');
      }

      const envelope = await gstLookupService.validateAadhaar(aadhaarNumber);
      await saveKycSnapshotForEntity(
        parsePersistKycRequest(req, 'aadhaar'),
        envelope
      );

      return ResponseHandler.success(
        res,
        { ...envelope.mapped, surepass_response: envelope.raw },
        'Aadhaar validated successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async verifyBankAccount(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const accountNumber = (req.query.account_number || req.query.id_number) as string;
      const ifscCode = (req.query.ifsc_code || req.query.ifsc) as string;

      if (!accountNumber || !ifscCode) {
        throw new ValidationError('account_number and ifsc_code are required');
      }

      const includeIfscDetails = req.query.ifsc_details !== 'false';
      const envelope = await gstLookupService.verifyBankAccount(accountNumber, ifscCode, {
        includeIfscDetails,
      });

      await saveKycSnapshotForEntity(parsePersistKycRequest(req, 'bank'), envelope);

      return ResponseHandler.success(
        res,
        { ...envelope.mapped, surepass_response: envelope.raw },
        'Bank account verified successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async verifyDrivingLicense(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { license_number, dob } = validate<{ license_number: string; dob?: string }>(
        verifyDriverSchema,
        req.body
      );

      const envelope = await gstLookupService.verifyDrivingLicense(license_number, dob);
      await saveKycSnapshotForEntity(
        parsePersistKycRequest(req, 'driving_license'),
        envelope
      );

      return ResponseHandler.success(
        res,
        { ...envelope.mapped, surepass_response: envelope.raw },
        'Driving licence verified successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async verifyEmail(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const email = req.query.email as string;
      if (!email) {
        throw new ValidationError('email is required');
      }

      const envelope = await gstLookupService.verifyEmail(email);
      await saveKycSnapshotForEntity(
        parsePersistKycRequest(req, 'email', email),
        envelope
      );

      return ResponseHandler.success(
        res,
        { ...envelope.mapped, surepass_response: envelope.raw },
        'Email verified successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async lookupGSTAdvanced(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const gstNumber = (req.query.gst_number || req.query.gstin) as string;
      if (!gstNumber) {
        throw new ValidationError('gst_number is required');
      }

      const envelope = await gstLookupService.lookupGSTAdvanced(gstNumber);
      const mappedData = gstLookupService.mapGSTAdvancedToBusinessData(envelope.mapped);

      await saveKycSnapshotForEntity(
        parsePersistKycRequest(req, 'gst_advanced'),
        envelope
      );

      return ResponseHandler.success(
        res,
        {
          gst_data: envelope.mapped,
          mapped_data: mappedData,
          surepass_response: envelope.raw,
        },
        'GSTIN details fetched successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async lookupPANComprehensive(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const panNumber = req.query.pan_number as string;
      if (!panNumber) {
        throw new ValidationError('pan_number is required');
      }

      const envelope = await gstLookupService.lookupPANComprehensive(panNumber);
      const mappedData = gstLookupService.mapPANToBusinessData({
        pan: envelope.mapped.pan_number || panNumber,
        name: envelope.mapped.full_name || envelope.mapped.name || '',
        category: envelope.mapped.category || 'Individual',
        status: 'Active',
        lastUpdated: new Date().toISOString().split('T')[0],
      });

      await saveKycSnapshotForEntity(
        parsePersistKycRequest(req, 'pan_comprehensive'),
        envelope
      );

      return ResponseHandler.success(
        res,
        {
          pan_data: envelope.mapped,
          mapped_data: mappedData,
          surepass_response: envelope.raw,
        },
        'PAN details fetched successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async lookupRcChallanDetails(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const payload = validate<RcChallanDetailsRequest>(rcChallanDetailsSchema, req.body);
      const envelope = await gstLookupService.lookupRcChallanDetails(payload);

      await saveKycSnapshotForEntity(
        parsePersistKycRequest(req, 'rc_challan'),
        envelope
      );

      return ResponseHandler.success(
        res,
        { ...envelope.mapped, surepass_response: envelope.raw },
        'RC challan details fetched successfully'
      );
    } catch (error) {
      next(error);
    }
  }
}

export const kycController = new KycController();
