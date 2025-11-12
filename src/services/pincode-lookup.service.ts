import { logger } from '../utils/logger';
import { ValidationError, BadRequestError, InternalServerError, NotFoundError } from '../utils/errors';

/**
 * Postal Pincode API Response Interface
 * Based on https://api.postalpincode.in/pincode/{PINCODE}
 */
export interface PostOffice {
  Name: string;
  Description: string | null;
  BranchType: string;
  DeliveryStatus: string;
  Circle: string;
  District: string;
  Division: string;
  Region: string;
  Block: string;
  State: string;
  Country: string;
  Pincode: string;
}

export interface PostalPincodeResponse {
  Message: string;
  Status: string;
  PostOffice: PostOffice[];
}

export interface PincodeLookupResponse {
  pincode: string;
  status: string;
  message: string;
  postOffices: PostOffice[];
}

/**
 * Pincode Lookup Service
 * Fetches pincode details from postal pincode API
 */
export class PincodeLookupService {
  private static readonly API_BASE_URL = 'https://api.postalpincode.in/pincode';

  /**
   * Validate pincode format (6 digits)
   */
  private static validatePincodeFormat(pincode: string): boolean {
    const pincodeRegex = /^\d{6}$/;
    return pincodeRegex.test(pincode);
  }

  /**
   * Lookup pincode details using postal pincode API
   */
  static async lookupPincode(pincode: string): Promise<PincodeLookupResponse> {
    // Validate format
    if (!this.validatePincodeFormat(pincode)) {
      throw new ValidationError('Invalid pincode format. Expected 6 digits.');
    }

    logger.info('Pincode lookup requested', { pincode });

    try {
      // Make API call to postal pincode API
      const apiUrl = `${this.API_BASE_URL}/${pincode}`;
      logger.debug('Calling postal pincode API', { url: apiUrl });

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Postal pincode API error', {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });
        throw new BadRequestError(`Pincode lookup failed: ${response.statusText}`);
      }

      const apiResponse = (await response.json()) as PostalPincodeResponse[];

      // Check if response is valid
      if (!Array.isArray(apiResponse) || apiResponse.length === 0) {
        logger.warn('Postal pincode API returned invalid response', { response: apiResponse });
        throw new BadRequestError('Invalid response from pincode lookup service');
      }

      const firstResponse = apiResponse[0];

      // Check if status is Success
      if (firstResponse.Status !== 'Success') {
        logger.warn('Pincode lookup returned non-success status', {
          status: firstResponse.Status,
          message: firstResponse.Message,
        });
        throw new BadRequestError(
          firstResponse.Message || `Pincode lookup failed: ${firstResponse.Status}`
        );
      }

      // Check if post offices are found
      if (!firstResponse.PostOffice || firstResponse.PostOffice.length === 0) {
        logger.warn('No post offices found for pincode', { pincode });
        throw new NotFoundError('No post offices found for the given pincode');
      }

      // Map response to our format
      const lookupResponse: PincodeLookupResponse = {
        pincode,
        status: firstResponse.Status,
        message: firstResponse.Message,
        postOffices: firstResponse.PostOffice,
      };

      logger.info('Pincode lookup successful', {
        pincode,
        postOfficeCount: firstResponse.PostOffice.length,
      });

      return lookupResponse;
    } catch (error: any) {
      // Re-throw known errors
      if (error instanceof ValidationError || error instanceof BadRequestError || error instanceof NotFoundError) {
        throw error;
      }

      // Handle unknown errors
      logger.error('Pincode lookup error', {
        error: error.message || error,
        stack: error.stack,
        pincode,
      });

      throw new InternalServerError('Failed to lookup pincode details');
    }
  }
}

export const pincodeLookupService = new PincodeLookupService();

