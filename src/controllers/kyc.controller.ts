import { Response, NextFunction } from 'express';
import { ResponseHandler } from '../utils/response';
import { ValidationError } from '../utils/errors';
import { AuthRequest } from '../middleware/auth.middleware';
import { gstLookupService } from '../services/gst-lookup.service';
import { validate, verifyDriverSchema, rcChallanDetailsSchema, rcFullSchema } from '../utils/validators';
import type { RcChallanDetailsRequest } from '../services/gst-lookup.service';
import { parsePersistKycRequest, saveKycSnapshotForEntity } from '../utils/kyc-persist-request';
import { parseLicenseOcrUpload, drivingLicenseOcrPayload } from '../utils/license-ocr-request';
import {
  parseDocumentOcrUpload,
  gstOcrPayload,
  panOcrPayload,
  aadhaarOcrPayload,
  vehicleRcOcrPayload,
} from '../utils/document-ocr-request';

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
      const body = validate<{
        license_number?: string;
        id_number?: string;
        dob?: string;
        date_of_birth?: string;
      }>(verifyDriverSchema, req.body);

      const license_number = body.license_number ?? body.id_number!;
      const dob = body.dob ?? body.date_of_birth;
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

  async lookupGstinByPan(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const panNumber = req.query.pan_number as string;
      if (!panNumber) {
        throw new ValidationError('pan_number is required');
      }

      const envelope = await gstLookupService.lookupGstinByPan(panNumber);
      await saveKycSnapshotForEntity(
        parsePersistKycRequest(req, 'gstin_by_pan'),
        envelope
      );

      return ResponseHandler.success(
        res,
        {
          ...envelope.mapped,
          surepass_response: envelope.raw,
        },
        'GSTIN list fetched successfully for PAN'
      );
    } catch (error) {
      next(error);
    }
  }

  async lookupPanContact(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const panNumber = req.query.pan_number as string;
      if (!panNumber) {
        throw new ValidationError('pan_number is required');
      }

      const envelope = await gstLookupService.lookupPanContact(panNumber);
      await saveKycSnapshotForEntity(
        parsePersistKycRequest(req, 'pan_contact'),
        envelope
      );

      return ResponseHandler.success(
        res,
        {
          ...envelope.mapped,
          surepass_response: envelope.raw,
        },
        'PAN contact details fetched successfully'
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

  async lookupRcFull(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const payload = validate<{
        id_number: string;
        state_only?: boolean;
        state_portal?: string[];
      }>(rcFullSchema, req.body);

      const result = await gstLookupService.lookupRcFullWithChallanDetails(payload.id_number, {
        state_only: payload.state_only,
        state_portal: payload.state_portal,
      });

      const persist = parsePersistKycRequest(req, 'rc_full');
      await saveKycSnapshotForEntity(persist, result.rcFull);

      if (result.rcChallan) {
        await saveKycSnapshotForEntity(
          persist ? { ...persist, verification_key: 'rc_challan' } : undefined,
          result.rcChallan
        );
      }

      return ResponseHandler.success(
        res,
        {
          ...result.rcFull.mapped,
          surepass_response: result.rcFull.raw,
          rc_challan: result.rcChallan
            ? {
                ...result.rcChallan.mapped,
                surepass_response: result.rcChallan.raw,
              }
            : null,
          rc_challan_error: result.rcChallanError,
        },
        result.rcChallan
          ? 'RC full and challan details fetched successfully'
          : 'RC full details fetched successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async ocrDrivingLicense(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { front, back, usePdf } = parseLicenseOcrUpload(req);
      const envelope = await gstLookupService.ocrDrivingLicense({ front, back, usePdf });

      return ResponseHandler.success(
        res,
        {
          ...drivingLicenseOcrPayload(envelope.mapped),
          surepass_response: envelope.raw,
        },
        'Driving licence scanned successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async ocrGst(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { file } = parseDocumentOcrUpload(req);
      const envelope = await gstLookupService.ocrGst({ file });

      return ResponseHandler.success(
        res,
        {
          ...gstOcrPayload(envelope.mapped),
          surepass_response: envelope.raw,
        },
        'GST document scanned successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async ocrPan(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { file, usePdf } = parseDocumentOcrUpload(req);
      const envelope = await gstLookupService.ocrPan({ file, usePdf });

      return ResponseHandler.success(
        res,
        {
          ...panOcrPayload(envelope.mapped),
          surepass_response: envelope.raw,
        },
        'PAN card scanned successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async ocrAadhaar(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { file } = parseDocumentOcrUpload(req);
      const envelope = await gstLookupService.ocrAadhaar({ file });

      return ResponseHandler.success(
        res,
        {
          ...aadhaarOcrPayload(envelope.mapped),
          surepass_response: envelope.raw,
        },
        'Aadhaar card scanned successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async ocrVehicleRc(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { file } = parseDocumentOcrUpload(req);
      const envelope = await gstLookupService.ocrVehicleRc({ file });

      return ResponseHandler.success(
        res,
        {
          ...vehicleRcOcrPayload(envelope.mapped),
          surepass_response: envelope.raw,
        },
        'Vehicle RC scanned successfully'
      );
    } catch (error) {
      next(error);
    }
  }
}

export const kycController = new KycController();
