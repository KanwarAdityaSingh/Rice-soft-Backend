import { logger } from '../utils/logger';
import { ValidationError, BadRequestError, InternalServerError } from '../utils/errors';
import { appConfig } from '../config/app.config';

/**
 * GST API Response Interface
 * Based on GST Public Search API structure
 */
export interface GSTLookupResponse {
  gstin: string;
  legalName: string;
  tradeName: string;
  registrationDate: string;
  constitutionOfBusiness: string;
  taxpayerType: string;
  gstinStatus: string;
  lastUpdateDate: string;
  principalPlaceOfBusiness: {
    buildingName: string;
    buildingNumber: string;
    floorNumber: string;
    street: string;
    location: string;
    district: string;
    city: string;
    state: string;
    pincode: string;
    latitude: string;
    longitude: string;
  };
  additionalPlacesOfBusiness: any[];
  filingStatus: any[];
}

/**
 * Surepass PAN API Response Interface
 */
export interface SurepassPANResponse {
  status_code: number;
  message?: string;
  message_code?: string;
  success?: boolean;
  data?: {
    full_name?: string;
    name?: string;
    pan_number?: string;
    category?: string;
    client_id?: string;
  };
}

/**
 * PAN API Response Interface
 * Based on Income Tax PAN Verification API structure
 */
export interface PANLookupResponse {
  pan: string;
  name: string;
  category: string;
  status: string;
  lastUpdated: string;
}

/**
 * Surepass Bank Verification API Response Interface
 */
export interface SurepassBankVerificationResponse {
  success: boolean;
  status_code: number;
  message: string;
  data?: {
    account_exists: boolean;
    full_name: string;
    account_number: string;
    ifsc: string;
    bank_name?: string;
    branch?: string;
    upi_id?: string;
  };
}

/**
 * Bank Verification Result Interface
 */
export interface BankVerificationResult {
  account_exists: boolean;
  account_holder_name: string;
  account_number: string;
  ifsc_code: string;
  bank_name?: string;
  branch?: string;
}

/**
 * Surepass RC Verification API Response Interface
 */
export interface SurepassRCVerificationResponse {
  success: boolean;
  status_code: number;
  message: string;
  message_code?: string;
  data?: {
    rc_number: string;
    owner_name: string;
    vehicle_class: string;
    fuel_type: string;
    maker_model: string;
    registration_date: string;
    insurance_validity: string;
    fitness_validity: string;
    permit_validity?: string;
    challan_details?: any[];
    [key: string]: any;
  };
}

/**
 * Vehicle Verification Result Interface
 */
export interface VehicleVerificationResult {
  vehicle_number: string;
  rc_number: string;
  owner_name: string;
  vehicle_class: string;
  fuel_type: string;
  maker_model: string;
  registration_date: string;
  insurance_validity: string;
  fitness_validity: string;
  permit_validity: string | null;
  challan_details: any[];
}

/**
 * MastersIndia Auth Token Response Interface
 */
export interface MastersIndiaTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
}

/**
 * MastersIndia GST API Response Interface
 */
export interface MastersIndiaGSTResponse {
  error: boolean;
  message?: string;
  data?: {
    gstin?: string;
    sts: string;
    tradeNam?: string;
    lgnm?: string;
    rgdt?: string;
    ctb?: string;
    ctjCd?: string;
    ctj?: string;
    pradr?: {
      addr?: {
        bno?: string;
        st?: string;
        loc?: string;
        dst?: string;
        city?: string;
        stcd?: string;
        pncd?: string;
      };
    };
    [key: string]: any;
  };
}

/**
 * Mapped Business Data Interface
 * Standardized format for our application
 */
export interface MappedBusinessData {
  business_name: string;
  legal_name?: string;
  address: {
    street: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
  };
  business_details: {
    pan_number?: string;
    gst_number?: string;
    registration_number?: string;
    business_type?: 'individual' | 'partnership' | 'company' | 'llp';
  };
  registration_date?: string;
  status?: string;
}

export class GSTLookupService {
  // MastersIndia token cache
  private static mastersIndiaTokenCache: {
    token: string;
    expiresAt: number;
  } | null = null;

  // Token cache duration (default 1 hour, but we'll use expires_in from API if available)
  private static readonly TOKEN_CACHE_DURATION = 3600000; // 1 hour in milliseconds
  /**
   * Validate GST Number Format
   * Format: 15 characters - 2 digits (state code) + 10 chars (PAN) + 1 char (entity number) + 1 char (Z) + 1 char (checksum)
   */
  static validateGSTFormat(gstNumber: string): boolean {
    const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    return gstRegex.test(gstNumber);
  }

  /**
   * Validate PAN Number Format
   * Format: 10 characters - 5 letters + 4 digits + 1 letter
   */
  static validatePANFormat(panNumber: string): boolean {
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    return panRegex.test(panNumber);
  }

  /**
   * Validate Aadhaar Number Format
   * Format: 12 digits (with or without spaces)
   */
  static validateAadhaarFormat(aadhaarNumber: string): boolean {
    // Remove spaces if present
    const cleaned = aadhaarNumber.replace(/\s/g, '');
    // Must be exactly 12 digits, not starting with 0 or 1
    const aadhaarRegex = /^[2-9]{1}[0-9]{11}$/;
    return aadhaarRegex.test(cleaned);
  }

  /**
   * Extract PAN from GST Number
   * PAN is characters 3-12 of GST number
   */
  static extractPANFromGST(gstNumber: string): string {
    if (!this.validateGSTFormat(gstNumber)) {
      throw new ValidationError('Invalid GST number format');
    }
    return gstNumber.substring(2, 12);
  }

  /**
   * Get MastersIndia Authentication Token
   * Caches token to avoid unnecessary API calls
   */
  private static async getMasterIndiaAuthToken(): Promise<string> {
    // Check if we have a valid cached token
    if (
      this.mastersIndiaTokenCache &&
      this.mastersIndiaTokenCache.expiresAt > Date.now()
    ) {
      logger.debug('Using cached MastersIndia token');
      return this.mastersIndiaTokenCache.token;
    }

    const config = appConfig.apis.mastersIndia;

    if (!config.username || !config.password || !config.clientId || !config.clientSecret) {
      throw new InternalServerError('MastersIndia API credentials not configured');
    }

    try {
      logger.info('Fetching MastersIndia auth token');

      const authData = {
        username: config.username,
        password: config.password,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'password',
      };

      const response = await fetch(config.authUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(authData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('MastersIndia auth failed', {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });
        throw new InternalServerError('Failed to authenticate with MastersIndia API');
      }

      const tokenData = (await response.json()) as MastersIndiaTokenResponse;

      if (!tokenData.access_token) {
        throw new InternalServerError('Invalid token response from MastersIndia API');
      }

      // Cache the token with expiration
      const expiresIn = tokenData.expires_in
        ? tokenData.expires_in * 1000 // Convert seconds to milliseconds
        : this.TOKEN_CACHE_DURATION;
      
      this.mastersIndiaTokenCache = {
        token: tokenData.access_token,
        expiresAt: Date.now() + expiresIn - 60000, // Refresh 1 minute before expiry
      };

      logger.info('MastersIndia auth token obtained successfully');
      return tokenData.access_token;
    } catch (error) {
      logger.error('MastersIndia token fetch failed', { error });
      if (error instanceof InternalServerError) {
        throw error;
      }
      throw new InternalServerError('Failed to fetch MastersIndia authentication token');
    }
  }

  /**
   * Lookup GST Number using MastersIndia API
   */
  static async lookupGST(gstNumber: string): Promise<GSTLookupResponse> {
    // Validate format
    if (!this.validateGSTFormat(gstNumber)) {
      throw new ValidationError('Invalid GST number format. Expected format: 27ABCDE1234F1Z5');
    }

    logger.info('GST lookup requested', { gstNumber });

    try {
      // Get authentication token
      const token = await this.getMasterIndiaAuthToken();
      const config = appConfig.apis.mastersIndia;

      // Make API call to MastersIndia
      const apiUrl = `${config.url}?gstin=${encodeURIComponent(gstNumber)}`;
      logger.debug('Calling MastersIndia API', { url: config.url });

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'client_id': config.clientId,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('MastersIndia API error', {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });
        throw new BadRequestError(`GST lookup failed: ${response.statusText}`);
      }

      const apiResponse = (await response.json()) as MastersIndiaGSTResponse;

      // Handle API error response
      if (apiResponse.error === true) {
        logger.warn('MastersIndia API returned error', { message: apiResponse.message });
        throw new BadRequestError(apiResponse.message || 'Invalid GSTIN');
      }

      // Check if GSTIN status is Active
      if (apiResponse.data?.sts !== 'Active') {
        logger.warn('GSTIN status is not Active', { status: apiResponse.data?.sts });
        throw new BadRequestError(
          `GSTIN is valid but status is ${apiResponse.data?.sts || 'Unknown'}`
        );
      }

      // Map MastersIndia response to our GSTLookupResponse format
      const gstData = this.mapMastersIndiaToGSTLookupResponse(gstNumber, apiResponse.data);

      logger.info('GST lookup successful', { gstNumber });
      return gstData;
    } catch (error) {
      logger.error('GST lookup failed', { gstNumber, error });
      if (error instanceof ValidationError || error instanceof BadRequestError) {
        throw error;
      }
      throw new InternalServerError('Failed to fetch GST details from external API');
    }
  }

  /**
   * Lookup PAN Number using Surepass API
   */
  static async lookupPAN(panNumber: string): Promise<PANLookupResponse> {
    // Validate format
    if (!this.validatePANFormat(panNumber)) {
      throw new ValidationError('Invalid PAN number format. Expected format: ABCDE1234F');
    }

    logger.info('PAN lookup requested', { panNumber });

    try {
      const config = appConfig.apis.surepass;

      if (!config.token) {
        throw new InternalServerError('Surepass API token not configured');
      }

      // Strip "Bearer " prefix if it exists in the token
      const token = config.token.startsWith('Bearer ')
        ? config.token.substring(7)
        : config.token;

      // Make API call to Surepass
      logger.debug('Calling Surepass PAN API', { url: config.panUrl });

      const response = await fetch(config.panUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          id_number: panNumber,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Surepass API error', {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });
        throw new BadRequestError(`PAN lookup failed: ${response.statusText}`);
      }

      const apiResponse = (await response.json()) as SurepassPANResponse;

      // Handle API error response
      if (apiResponse.status_code !== 200 || apiResponse.success !== true) {
        logger.warn('Surepass API returned error', {
          status_code: apiResponse.status_code,
          message: apiResponse.message,
          success: apiResponse.success,
        });
        throw new BadRequestError(apiResponse.message || 'Failed to fetch PAN details');
      }

      // Check if data is present
      if (!apiResponse.data) {
        logger.warn('Surepass API returned empty data', { response: apiResponse });
        throw new BadRequestError('PAN details not found');
      }

      // Extract name from full_name or name field
      const name = apiResponse.data.full_name || apiResponse.data.name;
      if (!name) {
        logger.warn('Surepass API returned data without name', { response: apiResponse });
        throw new BadRequestError('PAN name not found in response');
      }

      // Map Surepass response to our PANLookupResponse format
      const panData: PANLookupResponse = {
        pan: apiResponse.data.pan_number || panNumber,
        name: name,
        category: apiResponse.data.category || 'Individual',
        status: 'Active',
        lastUpdated: new Date().toISOString().split('T')[0],
      };

      logger.info('PAN lookup successful', { panNumber });
      return panData;
    } catch (error) {
      logger.error('PAN lookup failed', { panNumber, error });
      if (error instanceof ValidationError || error instanceof BadRequestError) {
        throw error;
      }
      throw new InternalServerError('Failed to fetch PAN details from external API');
    }
  }

  /**
   * Verify Bank Account using Surepass API
   */
  static async verifyBankAccount(
    accountNumber: string,
    ifscCode: string
  ): Promise<BankVerificationResult> {
    // Validate IFSC format (11 characters, alphanumeric)
    const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
    if (!ifscRegex.test(ifscCode.toUpperCase())) {
      throw new ValidationError('Invalid IFSC code format. Expected format: ABCD0123456');
    }

    // Validate account number (typically 9-18 digits)
    if (!accountNumber || accountNumber.length < 9 || accountNumber.length > 18) {
      throw new ValidationError('Invalid account number. Must be 9-18 digits');
    }

    logger.info('Bank account verification requested', { 
      accountNumber: accountNumber.substring(0, 4) + '****', // Mask for security
      ifscCode 
    });

    try {
      const config = appConfig.apis.surepass;

      if (!config.token) {
        throw new InternalServerError('Surepass API token not configured');
      }

      // Strip "Bearer " prefix if it exists
      const token = config.token.startsWith('Bearer ')
        ? config.token.substring(7)
        : config.token;

      // Make API call to Surepass Bank Verification
      logger.debug('Calling Surepass Bank Verification API', { url: config.bankVerificationUrl });

      const response = await fetch(config.bankVerificationUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          id_number: accountNumber,
          ifsc: ifscCode.toUpperCase(),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Surepass Bank Verification API error', {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });
        throw new BadRequestError(`Bank verification failed: ${response.statusText}`);
      }

      const apiResponse = (await response.json()) as SurepassBankVerificationResponse;

      // Handle API error response
      if (apiResponse.status_code !== 200 || apiResponse.success !== true) {
        logger.warn('Surepass Bank API returned error', {
          status_code: apiResponse.status_code,
          message: apiResponse.message,
          success: apiResponse.success,
        });
        throw new BadRequestError(apiResponse.message || 'Failed to verify bank account');
      }

      // Check if data is present
      if (!apiResponse.data) {
        logger.warn('Surepass Bank API returned empty data', { response: apiResponse });
        throw new BadRequestError('Bank account verification returned no data');
      }

      // Check if account exists
      if (!apiResponse.data.account_exists) {
        throw new BadRequestError('Bank account does not exist or is inactive');
      }

      logger.info('Bank account verification successful', {
        accountNumber: accountNumber.substring(0, 4) + '****',
        ifscCode,
        accountHolderName: apiResponse.data.full_name,
      });

      // Return mapped response
      return {
        account_exists: apiResponse.data.account_exists,
        account_holder_name: apiResponse.data.full_name,
        account_number: apiResponse.data.account_number,
        ifsc_code: apiResponse.data.ifsc,
        bank_name: apiResponse.data.bank_name,
        branch: apiResponse.data.branch,
      };
    } catch (error) {
      if (error instanceof ValidationError || 
          error instanceof BadRequestError || 
          error instanceof InternalServerError) {
        throw error;
      }

      logger.error('Unexpected error during bank verification', { error });
      throw new InternalServerError('Failed to verify bank account');
    }
  }

  /**
   * Map MastersIndia GST API response to our GSTLookupResponse format
   */
  private static mapMastersIndiaToGSTLookupResponse(
    gstNumber: string,
    data: MastersIndiaGSTResponse['data']
  ): GSTLookupResponse {
    if (!data) {
      throw new BadRequestError('Invalid GST data received from API');
    }

    const address = data.pradr?.addr || {};

    return {
      gstin: data.gstin || gstNumber,
      legalName: data.lgnm || data.tradeNam || 'Unknown',
      tradeName: data.tradeNam || data.lgnm || 'Unknown',
      registrationDate: data.rgdt || new Date().toISOString().split('T')[0],
      constitutionOfBusiness: data.ctb || 'Unknown',
      taxpayerType: data.ctj || 'Regular',
      gstinStatus: data.sts || 'Active',
      lastUpdateDate: new Date().toISOString().split('T')[0],
      principalPlaceOfBusiness: {
        buildingName: address.bno || '',
        buildingNumber: '',
        floorNumber: '',
        street: address.st || '',
        location: address.loc || '',
        district: address.dst || '',
        city: address.city || address.dst || '',
        state: this.getStateFromGST(gstNumber),
        pincode: address.pncd || '',
        latitude: '',
        longitude: '',
      },
      additionalPlacesOfBusiness: [],
      filingStatus: [],
    };
  }

  /**
   * Map GST API response to our application format
   */
  static mapGSTToBusinessData(gstData: GSTLookupResponse): MappedBusinessData {
    const address = gstData.principalPlaceOfBusiness;
    
    // Determine business type from constitution
    let businessType: 'individual' | 'partnership' | 'company' | 'llp' = 'company';
    const constitution = gstData.constitutionOfBusiness.toLowerCase();
    if (constitution.includes('individual') || constitution.includes('proprietor')) {
      businessType = 'individual';
    } else if (constitution.includes('partnership')) {
      businessType = 'partnership';
    } else if (constitution.includes('llp') || constitution.includes('limited liability')) {
      businessType = 'llp';
    }

    return {
      business_name: gstData.tradeName || gstData.legalName,
      legal_name: gstData.legalName,
      address: {
        street: [address.buildingNumber, address.buildingName, address.street].filter(Boolean).join(', '),
        city: address.city || address.district,
        state: address.state,
        pincode: address.pincode,
        country: 'India',
      },
      business_details: {
        gst_number: gstData.gstin,
        pan_number: this.extractPANFromGST(gstData.gstin),
        registration_number: gstData.gstin,
        business_type: businessType,
      },
      registration_date: gstData.registrationDate,
      status: gstData.gstinStatus,
    };
  }

  /**
   * Map PAN API response to our application format
   */
  static mapPANToBusinessData(panData: PANLookupResponse): MappedBusinessData {
    // Determine business type from category
    let businessType: 'individual' | 'partnership' | 'company' | 'llp' = 'company';
    const category = panData.category.toLowerCase();
    if (category.includes('individual') || category.includes('person')) {
      businessType = 'individual';
    } else if (category.includes('partnership')) {
      businessType = 'partnership';
    } else if (category.includes('llp')) {
      businessType = 'llp';
    }

    return {
      business_name: panData.name,
      address: {
        street: '',
        city: '',
        state: '',
        pincode: '',
        country: 'India',
      },
      business_details: {
        pan_number: panData.pan,
        business_type: businessType,
      },
      status: panData.status,
    };
  }

  /**
   * Get state name from GST state code
   */
  private static getStateFromGST(gstNumber: string): string {
    const stateCode = gstNumber.substring(0, 2);
    const stateMap: { [key: string]: string } = {
      '01': 'Jammu and Kashmir',
      '02': 'Himachal Pradesh',
      '03': 'Punjab',
      '04': 'Chandigarh',
      '05': 'Uttarakhand',
      '06': 'Haryana',
      '07': 'Delhi',
      '08': 'Rajasthan',
      '09': 'Uttar Pradesh',
      '10': 'Bihar',
      '11': 'Sikkim',
      '12': 'Arunachal Pradesh',
      '13': 'Nagaland',
      '14': 'Manipur',
      '15': 'Mizoram',
      '16': 'Tripura',
      '17': 'Meghalaya',
      '18': 'Assam',
      '19': 'West Bengal',
      '20': 'Jharkhand',
      '21': 'Odisha',
      '22': 'Chhattisgarh',
      '23': 'Madhya Pradesh',
      '24': 'Gujarat',
      '25': 'Daman and Diu',
      '26': 'Dadra and Nagar Haveli',
      '27': 'Maharashtra',
      '28': 'Andhra Pradesh',
      '29': 'Karnataka',
      '30': 'Goa',
      '31': 'Lakshadweep',
      '32': 'Kerala',
      '33': 'Tamil Nadu',
      '34': 'Puducherry',
      '35': 'Andaman and Nicobar Islands',
      '36': 'Telangana',
      '37': 'Andhra Pradesh',
      '38': 'Ladakh',
    };
    return stateMap[stateCode] || 'Unknown';
  }

  /**
   * Validate GST number with checksum
   * (Optional advanced validation)
   */
  static validateGSTChecksum(gstNumber: string): boolean {
    if (!this.validateGSTFormat(gstNumber)) {
      return false;
    }
    // GST checksum validation logic can be implemented here
    // For now, just format validation
    return true;
  }

  /**
   * Verify Vehicle RC using Surepass API
   * @param vehicleNumber - Vehicle registration number (e.g., DL01AB1234)
   * @returns Vehicle verification result with details
   */
  static async verifyVehicleRC(vehicleNumber: string): Promise<VehicleVerificationResult> {
    try {
      // Clean and validate vehicle number
      const cleanedVehicleNumber = vehicleNumber.trim().toUpperCase().replace(/\s+/g, '');
      
      if (!cleanedVehicleNumber) {
        throw new ValidationError('Vehicle number is required');
      }

      logger.info('Verifying vehicle RC via Surepass', { vehicleNumber: cleanedVehicleNumber });

      const response = await fetch(appConfig.apis.surepass.rcVerificationUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${appConfig.apis.surepass.token}`,
        },
        body: JSON.stringify({
          id_number: cleanedVehicleNumber,
        }),
      });

      if (!response.ok) {
        logger.error('Surepass RC verification API error', {
          status: response.status,
          statusText: response.statusText,
        });
        throw new InternalServerError(`RC verification failed: ${response.statusText}`);
      }

      const data = await response.json() as SurepassRCVerificationResponse;

      if (!data.success || data.status_code !== 200) {
        logger.warn('RC verification unsuccessful', {
          vehicleNumber: cleanedVehicleNumber,
          message: data.message,
          status_code: data.status_code,
        });
        throw new BadRequestError(data.message || 'Vehicle verification failed');
      }

      if (!data.data) {
        throw new BadRequestError('No vehicle data returned from verification');
      }

      // Map Surepass response to our standard format
      const result: VehicleVerificationResult = {
        vehicle_number: cleanedVehicleNumber,
        rc_number: data.data.rc_number || cleanedVehicleNumber,
        owner_name: data.data.owner_name || '',
        vehicle_class: data.data.vehicle_class || '',
        fuel_type: data.data.fuel_type || '',
        maker_model: data.data.maker_model || '',
        registration_date: data.data.registration_date || '',
        insurance_validity: data.data.insurance_validity || '',
        fitness_validity: data.data.fitness_validity || '',
        permit_validity: data.data.permit_validity || null,
        challan_details: data.data.challan_details || [],
      };

      logger.info('Vehicle RC verified successfully', {
        vehicleNumber: cleanedVehicleNumber,
        ownerName: result.owner_name,
      });

      return result;
    } catch (error) {
      if (error instanceof ValidationError || error instanceof BadRequestError) {
        throw error;
      }
      logger.error('Error verifying vehicle RC', { error, vehicleNumber });
      throw new InternalServerError('Failed to verify vehicle RC');
    }
  }
}

export const gstLookupService = GSTLookupService;

