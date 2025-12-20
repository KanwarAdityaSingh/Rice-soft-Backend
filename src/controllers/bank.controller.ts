import { Response, NextFunction } from 'express';
import { ResponseHandler } from '../utils/response';
import { ValidationError } from '../utils/errors';
import { IFSCLookupService } from '../services/ifsc-lookup.service';
import { AuthRequest } from '../middleware/auth.middleware';

export class BankController {
  /**
   * Lookup IFSC code and return bank details
   * GET /api/v1/bank/lookupIFSC?ifsc=HDFC0001234
   */
  async lookupIFSC(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const ifscCode = req.query.ifsc as string;

      if (!ifscCode) {
        throw new ValidationError('IFSC code is required');
      }

      // Validate IFSC format
      if (!IFSCLookupService.validateIFSCFormat(ifscCode)) {
        throw new ValidationError('Invalid IFSC code format. Expected format: HDFC0001234 (4 letters + 0 + 6 alphanumeric)');
      }

      // Lookup IFSC details
      const ifscDetails = await IFSCLookupService.lookupIFSC(ifscCode);

      // Map to bank details format for easy use in forms
      const bankDetails = IFSCLookupService.mapToBankDetails(ifscDetails);

      return ResponseHandler.success(res, {
        ifsc_details: ifscDetails,
        bank_details: bankDetails,
      }, 'IFSC lookup successful');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Validate IFSC format (client-side validation helper)
   * GET /api/v1/bank/validateIFSC?ifsc=HDFC0001234
   */
  async validateIFSC(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const ifscCode = req.query.ifsc as string;

      if (!ifscCode) {
        throw new ValidationError('IFSC code is required');
      }

      const isValid = IFSCLookupService.validateIFSCFormat(ifscCode);

      return ResponseHandler.success(res, {
        ifsc_code: ifscCode.toUpperCase(),
        is_valid: isValid,
        message: isValid 
          ? 'IFSC code format is valid' 
          : 'Invalid IFSC code format. Expected: 4 letters + 0 + 6 alphanumeric (e.g., HDFC0001234)',
      }, 'IFSC validation completed');
    } catch (error) {
      next(error);
    }
  }
}

export const bankController = new BankController();

