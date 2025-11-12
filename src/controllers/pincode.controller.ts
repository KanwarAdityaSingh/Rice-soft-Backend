import { Response, NextFunction } from 'express';
import { ResponseHandler } from '../utils/response';
import { ValidationError } from '../utils/errors';
import { AuthRequest } from '../middleware/auth.middleware';
import { PincodeLookupService, PincodeLookupResponse } from '../services/pincode-lookup.service';
import Joi from 'joi';

/**
 * Pincode validation schema
 */
const pincodeQuerySchema = Joi.object({
  pincode: Joi.string()
    .pattern(/^\d{6}$/)
    .required()
    .messages({
      'string.pattern.base': 'Pincode must be exactly 6 digits',
      'any.required': 'Pincode is required',
    }),
});

export class PincodeController {
  /**
   * Lookup pincode details
   * @route GET /api/v1/pincode/lookup
   * @access Private
   */
  async lookup(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      // Validate query parameters
      const { error, value } = pincodeQuerySchema.validate(req.query);

      if (error) {
        throw new ValidationError(error.details[0].message);
      }

      const { pincode } = value;

      // Call service to lookup pincode
      const lookupResult: PincodeLookupResponse = await PincodeLookupService.lookupPincode(pincode);

      return ResponseHandler.success(res, lookupResult, 'Pincode lookup successful');
    } catch (error) {
      next(error);
    }
  }
}

export const pincodeController = new PincodeController();

