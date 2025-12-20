import { logger } from '../utils/logger';
import { ValidationError, NotFoundError, InternalServerError } from '../utils/errors';

/**
 * Response from Razorpay IFSC API
 */
export interface RazorpayIFSCResponse {
  BANK: string;
  IFSC: string;
  BRANCH: string;
  CENTRE: string;
  DISTRICT: string;
  STATE: string;
  ADDRESS: string;
  CONTACT: string | null;
  CITY: string;
  IMPS: boolean;
  RTGS: boolean;
  NEFT: boolean;
  UPI: boolean;
  MICR: string | null;
  SWIFT: string | null;
}

/**
 * Our mapped IFSC lookup response
 */
export interface IFSCLookupResponse {
  ifsc_code: string;
  bank_name: string;
  branch: string;
  address: string;
  city: string;
  district: string;
  state: string;
  contact: string | null;
  micr_code: string | null;
  swift_code: string | null;
  supports: {
    imps: boolean;
    rtgs: boolean;
    neft: boolean;
    upi: boolean;
  };
}

/**
 * IFSC Lookup Service using Razorpay's free IFSC API
 * https://ifsc.razorpay.com/
 */
export class IFSCLookupService {
  private static readonly API_BASE_URL = 'https://ifsc.razorpay.com';

  /**
   * Validate IFSC code format
   * Format: 4 letters (bank code) + 0 + 6 alphanumeric (branch code)
   * Example: HDFC0001234
   */
  static validateIFSCFormat(ifscCode: string): boolean {
    if (!ifscCode) return false;
    // IFSC format: 4 letters + 0 + 6 alphanumeric characters = 11 characters
    const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
    return ifscRegex.test(ifscCode.toUpperCase());
  }

  /**
   * Lookup IFSC code details using Razorpay API
   */
  static async lookupIFSC(ifscCode: string): Promise<IFSCLookupResponse> {
    // Normalize to uppercase
    const normalizedIFSC = ifscCode.toUpperCase().trim();

    // Validate format
    if (!this.validateIFSCFormat(normalizedIFSC)) {
      throw new ValidationError('Invalid IFSC code format. Expected format: HDFC0001234 (4 letters + 0 + 6 alphanumeric)');
    }

    logger.info('IFSC lookup requested', { ifscCode: normalizedIFSC });

    try {
      const apiUrl = `${this.API_BASE_URL}/${normalizedIFSC}`;
      logger.debug('Calling Razorpay IFSC API', { url: apiUrl });

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Handle 404 - IFSC not found
      if (response.status === 404) {
        logger.warn('IFSC code not found', { ifscCode: normalizedIFSC });
        throw new NotFoundError(`IFSC code ${normalizedIFSC} not found. Please verify the code.`);
      }

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Razorpay IFSC API error', {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });
        throw new InternalServerError(`IFSC lookup failed: ${response.statusText}`);
      }

      const apiResponse = (await response.json()) as RazorpayIFSCResponse;

      // Map to our response format
      const lookupResponse: IFSCLookupResponse = {
        ifsc_code: apiResponse.IFSC,
        bank_name: apiResponse.BANK,
        branch: apiResponse.BRANCH,
        address: apiResponse.ADDRESS,
        city: apiResponse.CITY,
        district: apiResponse.DISTRICT,
        state: apiResponse.STATE,
        contact: apiResponse.CONTACT,
        micr_code: apiResponse.MICR,
        swift_code: apiResponse.SWIFT,
        supports: {
          imps: apiResponse.IMPS,
          rtgs: apiResponse.RTGS,
          neft: apiResponse.NEFT,
          upi: apiResponse.UPI,
        },
      };

      logger.info('IFSC lookup successful', {
        ifscCode: normalizedIFSC,
        bankName: lookupResponse.bank_name,
        branch: lookupResponse.branch,
      });

      return lookupResponse;
    } catch (error: any) {
      // Re-throw known errors
      if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof InternalServerError) {
        throw error;
      }

      // Handle network/unknown errors
      logger.error('IFSC lookup error', {
        error: error.message || error,
        stack: error.stack,
        ifscCode: normalizedIFSC,
      });

      throw new InternalServerError('Failed to lookup IFSC details. Please try again later.');
    }
  }

  /**
   * Map IFSC lookup response to bank details format used in vendor/broker
   */
  static mapToBankDetails(ifscResponse: IFSCLookupResponse): {
    bank_name: string;
    branch: string;
    ifsc_code: string;
  } {
    return {
      bank_name: ifscResponse.bank_name,
      branch: ifscResponse.branch,
      ifsc_code: ifscResponse.ifsc_code,
    };
  }
}

export const ifscLookupService = new IFSCLookupService();

