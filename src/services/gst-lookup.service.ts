import { logger } from '../utils/logger';
import { ValidationError, BadRequestError, InternalServerError } from '../utils/errors';
import { appConfig } from '../config/app.config';
import type { DriverLicenseVerificationResult } from '../models/driver.model';
import type { SurepassApiEnvelope, SurepassApiResponse } from '../models/kyc-verification.model';
import {
  normalizeDrivingLicenseForProvider,
  normalizeDrivingLicenseForStorage,
} from '../utils/driver-license';

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
export interface SurepassBankIfscDetails {
  ifsc?: string;
  micr?: string;
  bank?: string;
  bank_code?: string;
  bank_name?: string;
  branch?: string;
  centre?: string;
  district?: string;
  state?: string;
  city?: string;
  address?: string;
  contact?: string;
  imps?: boolean;
  rtgs?: boolean;
  neft?: boolean;
  upi?: boolean;
}

export interface SurepassBankVerificationResponse {
  success: boolean;
  status_code: number;
  message: string | null;
  message_code?: string;
  data?: {
    client_id?: string;
    account_exists: boolean;
    full_name: string;
    account_number?: string;
    ifsc?: string;
    bank_name?: string;
    branch?: string;
    upi_id?: string | null;
    imps_ref_no?: string;
    remarks?: string;
    status?: string;
    ifsc_details?: SurepassBankIfscDetails;
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
  upi_id?: string | null;
  imps_ref_no?: string;
  ifsc_details?: SurepassBankIfscDetails;
}

/**
 * Surepass Aadhaar Validation API Response
 */
export interface AadhaarValidationResult {
  client_id: string;
  aadhaar_number: string;
  age_range?: string;
  state?: string;
  gender?: string;
  last_digits?: string;
  is_mobile?: boolean;
  remarks?: string;
  less_info?: boolean;
}

/**
 * Surepass Email Check API Response
 */
export interface EmailVerificationResult {
  client_id: string;
  email: string;
  status: string;
  valid: boolean;
  valid_syntax: boolean;
  accepts_mail: boolean;
  smtp_connected: boolean;
  domain: string;
  username: string;
  is_temporary: boolean;
  is_catch_all: boolean;
  disabled: boolean;
  mx_records: string[];
  domain_age?: string | null;
  domain_registrar?: string | null;
  organization?: string | null;
}

/**
 * Surepass GSTIN Advanced API Response (subset used by app + full payload)
 */
export interface GSTINAdvancedResult {
  client_id: string;
  gstin: string;
  pan_number?: string;
  business_name?: string;
  legal_name?: string;
  center_jurisdiction?: string;
  state_jurisdiction?: string;
  date_of_registration?: string;
  constitution_of_business?: string;
  taxpayer_type?: string;
  gstin_status?: string;
  date_of_cancellation?: string;
  nature_bus_activities?: string[];
  promoters?: string[];
  annual_turnover?: string;
  annual_turnover_fy?: string;
  einvoice_status?: boolean;
  contact_details?: {
    principal?: {
      address?: string;
      email?: string;
      mobile?: string;
      nature_of_business?: string;
    };
    additional?: unknown[];
  };
  [key: string]: unknown;
}

/**
 * Surepass PAN Comprehensive API Response
 */
export interface PANComprehensiveResult {
  client_id?: string;
  pan_number?: string;
  full_name?: string;
  name?: string;
  category?: string;
  [key: string]: unknown;
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

export interface RcChallanDetailsRequest {
  rc_number: string;
  chassis_number: string;
  engine_number: string;
  state_only?: boolean;
  state_portal?: string[];
}

export interface RcChallanItem {
  number: number;
  challan_number: string;
  offense_details: string;
  challan_place: string | null;
  challan_date: string;
  state: string;
  rto: string | null;
  upstream_code: string;
  accused_name: string;
  amount: number;
  challan_status: string | null;
  court_challan: boolean | null;
}

export interface RcChallanDetailsResult {
  client_id: string;
  challan_details: {
    challans: RcChallanItem[];
    blacklist: unknown[];
  };
}

/**
 * Surepass Driving License Verification API response (fields may vary slightly by API version).
 */
export interface SurepassDLVerificationResponse {
  success: boolean;
  status_code: number;
  message: string;
  message_code?: string;
  data?: {
    full_name?: string;
    name?: string;
    holder_name?: string;
    license_number?: string;
    dl_number?: string;
    id_number?: string;
    dob?: string;
    date_of_birth?: string;
    date_of_birth_in_words?: string;
    doe?: string;
    date_of_expiry?: string;
    age?: string | number;
    address?: string | Record<string, unknown>;
    [key: string]: unknown;
  };
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

  private static getSurepassToken(): string {
    const token = appConfig.apis.surepass.token;
    if (!token) {
      throw new InternalServerError('Surepass API token not configured');
    }
    return token.startsWith('Bearer ') ? token.substring(7) : token;
  }

  private static async callSurepass<TData>(
    url: string,
    body: Record<string, unknown>,
    logLabel: string
  ): Promise<SurepassApiResponse<TData>> {
    const token = this.getSurepassToken();
    logger.debug(`Calling Surepass ${logLabel}`, { url });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Surepass ${logLabel} HTTP error`, {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
      throw new BadRequestError(`${logLabel} failed: ${response.statusText}`);
    }

    const apiResponse = (await response.json()) as SurepassApiResponse<TData>;

    if (apiResponse.status_code !== 200 || apiResponse.success !== true) {
      logger.warn(`Surepass ${logLabel} returned error`, {
        status_code: apiResponse.status_code,
        message: apiResponse.message,
        success: apiResponse.success,
      });
      throw new BadRequestError(apiResponse.message || `${logLabel} failed`);
    }

    return apiResponse;
  }
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
   * Lookup PAN Number using Surepass PAN Comprehensive API
   */
  static async lookupPAN(panNumber: string): Promise<PANLookupResponse> {
    const envelope = await this.lookupPANComprehensive(panNumber);
    const comprehensive = envelope.mapped;

    const name = comprehensive.full_name || comprehensive.name;
    if (!name) {
      throw new BadRequestError('PAN name not found in response');
    }

    return {
      pan: comprehensive.pan_number || panNumber,
      name,
      category: comprehensive.category || 'Individual',
      status: 'Active',
      lastUpdated: new Date().toISOString().split('T')[0],
    };
  }

  /**
   * Lookup PAN via Surepass Comprehensive API (returns full provider payload)
   */
  static async lookupPANComprehensive(
    panNumber: string
  ): Promise<SurepassApiEnvelope<PANComprehensiveResult>> {
    if (!this.validatePANFormat(panNumber)) {
      throw new ValidationError('Invalid PAN number format. Expected format: ABCDE1234F');
    }

    logger.info('PAN comprehensive lookup requested', { panNumber });

    try {
      const config = appConfig.apis.surepass;
      const raw = await this.callSurepass<PANComprehensiveResult>(
        config.panUrl,
        { id_number: panNumber },
        'PAN Comprehensive'
      );

      if (!raw.data) {
        throw new BadRequestError('PAN details not found');
      }

      logger.info('PAN comprehensive lookup successful', { panNumber });
      return { mapped: raw.data, raw };
    } catch (error) {
      logger.error('PAN comprehensive lookup failed', { panNumber, error });
      if (error instanceof ValidationError || error instanceof BadRequestError) {
        throw error;
      }
      throw new InternalServerError('Failed to fetch PAN details from external API');
    }
  }

  /**
   * Validate Aadhaar via Surepass Aadhaar Validation API
   */
  static async validateAadhaar(
    aadhaarNumber: string
  ): Promise<SurepassApiEnvelope<AadhaarValidationResult>> {
    const cleaned = aadhaarNumber.replace(/\s/g, '');
    if (!this.validateAadhaarFormat(cleaned)) {
      throw new ValidationError('Invalid Aadhaar number format. Expected format: 12 digits (not starting with 0 or 1)');
    }

    logger.info('Aadhaar validation requested', {
      aadhaarNumber: cleaned.substring(0, 4) + '********',
    });

    try {
      const config = appConfig.apis.surepass;
      const raw = await this.callSurepass<AadhaarValidationResult>(
        config.aadhaarValidationUrl,
        { id_number: cleaned },
        'Aadhaar Validation'
      );

      if (!raw.data) {
        throw new BadRequestError('Aadhaar validation returned no data');
      }

      logger.info('Aadhaar validation successful', {
        aadhaarNumber: cleaned.substring(0, 4) + '********',
        state: raw.data.state,
      });

      return { mapped: raw.data, raw };
    } catch (error) {
      logger.error('Aadhaar validation failed', { error });
      if (error instanceof ValidationError || error instanceof BadRequestError) {
        throw error;
      }
      throw new InternalServerError('Failed to validate Aadhaar via external API');
    }
  }

  /**
   * Verify email via Surepass Email Check API
   */
  static async verifyEmail(email: string): Promise<SurepassApiEnvelope<EmailVerificationResult>> {
    const normalized = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!normalized || !emailRegex.test(normalized)) {
      throw new ValidationError('Invalid email address format');
    }

    logger.info('Email verification requested', { email: normalized });

    try {
      const config = appConfig.apis.surepass;
      const raw = await this.callSurepass<EmailVerificationResult>(
        config.emailCheckUrl,
        { email: normalized },
        'Email Check'
      );

      if (!raw.data) {
        throw new BadRequestError('Email verification returned no data');
      }

      logger.info('Email verification successful', {
        email: normalized,
        valid: raw.data.valid,
        status: raw.data.status,
      });

      return { mapped: raw.data, raw };
    } catch (error) {
      logger.error('Email verification failed', { email: normalized, error });
      if (error instanceof ValidationError || error instanceof BadRequestError) {
        throw error;
      }
      throw new InternalServerError('Failed to verify email via external API');
    }
  }

  /**
   * Lookup GSTIN via Surepass Corporate GSTIN Advanced API
   */
  static async lookupGSTAdvanced(
    gstNumber: string
  ): Promise<SurepassApiEnvelope<GSTINAdvancedResult>> {
    if (!this.validateGSTFormat(gstNumber)) {
      throw new ValidationError('Invalid GST number format. Expected format: 27ABCDE1234F1Z5');
    }

    logger.info('GSTIN advanced lookup requested', { gstNumber });

    try {
      const config = appConfig.apis.surepass;
      const raw = await this.callSurepass<GSTINAdvancedResult>(
        config.gstinAdvancedUrl,
        { id_number: gstNumber },
        'GSTIN Advanced'
      );

      if (!raw.data) {
        throw new BadRequestError('GSTIN advanced lookup returned no data');
      }

      if (raw.data.gstin_status && raw.data.gstin_status !== 'Active') {
        throw new BadRequestError(
          `GSTIN is valid but status is ${raw.data.gstin_status}`
        );
      }

      logger.info('GSTIN advanced lookup successful', { gstNumber });
      return { mapped: raw.data, raw };
    } catch (error) {
      logger.error('GSTIN advanced lookup failed', { gstNumber, error });
      if (error instanceof ValidationError || error instanceof BadRequestError) {
        throw error;
      }
      throw new InternalServerError('Failed to fetch GSTIN details from external API');
    }
  }

  /**
   * Map Surepass GSTIN Advanced response to application business data format
   */
  static mapGSTAdvancedToBusinessData(gstData: GSTINAdvancedResult): MappedBusinessData {
    const principal = gstData.contact_details?.principal;
    const addressText = principal?.address || '';

    let businessType: 'individual' | 'partnership' | 'company' | 'llp' = 'company';
    const constitution = (gstData.constitution_of_business || '').toLowerCase();
    if (constitution.includes('individual') || constitution.includes('proprietor')) {
      businessType = 'individual';
    } else if (constitution.includes('partnership')) {
      businessType = 'partnership';
    } else if (constitution.includes('llp') || constitution.includes('limited liability')) {
      businessType = 'llp';
    }

    const pincodeMatch = addressText.match(/\b(\d{6})\b/);
    const pincode = pincodeMatch ? pincodeMatch[1] : '';

    return {
      business_name: gstData.business_name || gstData.legal_name || 'Unknown',
      legal_name: gstData.legal_name || gstData.business_name,
      address: {
        street: addressText,
        city: '',
        state: this.getStateFromGST(gstData.gstin),
        pincode,
        country: 'India',
      },
      business_details: {
        gst_number: gstData.gstin,
        pan_number: gstData.pan_number || this.extractPANFromGST(gstData.gstin),
        registration_number: gstData.gstin,
        business_type: businessType,
      },
      registration_date: gstData.date_of_registration,
      status: gstData.gstin_status,
    };
  }

  /**
   * Verify Bank Account using Surepass API
   */
  static async verifyBankAccount(
    accountNumber: string,
    ifscCode: string,
    options?: { includeIfscDetails?: boolean }
  ): Promise<SurepassApiEnvelope<BankVerificationResult>> {
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
      const includeIfscDetails = options?.includeIfscDetails !== false;

      const raw = await this.callSurepass<NonNullable<SurepassBankVerificationResponse['data']>>(
        config.bankVerificationUrl,
        {
          id_number: accountNumber,
          ifsc: ifscCode.toUpperCase(),
          ifsc_details: includeIfscDetails,
        },
        'Bank Verification'
      );

      if (!raw.data) {
        throw new BadRequestError('Bank account verification returned no data');
      }

      if (!raw.data.account_exists) {
        throw new BadRequestError('Bank account does not exist or is inactive');
      }

      const ifscDetails = raw.data.ifsc_details;

      logger.info('Bank account verification successful', {
        accountNumber: accountNumber.substring(0, 4) + '****',
        ifscCode,
        accountHolderName: raw.data.full_name,
      });

      const mapped: BankVerificationResult = {
        account_exists: raw.data.account_exists,
        account_holder_name: raw.data.full_name,
        account_number: raw.data.account_number || accountNumber,
        ifsc_code: raw.data.ifsc || ifscCode.toUpperCase(),
        bank_name: ifscDetails?.bank_name || ifscDetails?.bank || raw.data.bank_name,
        branch: ifscDetails?.branch || raw.data.branch,
        upi_id: raw.data.upi_id,
        imps_ref_no: raw.data.imps_ref_no,
        ifsc_details: includeIfscDetails ? ifscDetails : undefined,
      };

      return { mapped, raw };
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
  static async verifyVehicleRC(
    vehicleNumber: string
  ): Promise<SurepassApiEnvelope<VehicleVerificationResult>> {
    try {
      const cleanedVehicleNumber = vehicleNumber.trim().toUpperCase().replace(/\s+/g, '');

      if (!cleanedVehicleNumber) {
        throw new ValidationError('Vehicle number is required');
      }

      logger.info('Verifying vehicle RC via Surepass', { vehicleNumber: cleanedVehicleNumber });

      const config = appConfig.apis.surepass;
      const raw = await this.callSurepass<NonNullable<SurepassRCVerificationResponse['data']>>(
        config.rcVerificationUrl,
        { id_number: cleanedVehicleNumber },
        'RC Verification'
      );

      if (!raw.data) {
        throw new BadRequestError('No vehicle data returned from verification');
      }

      const mapped: VehicleVerificationResult = {
        vehicle_number: cleanedVehicleNumber,
        rc_number: raw.data.rc_number || cleanedVehicleNumber,
        owner_name: raw.data.owner_name || '',
        vehicle_class: raw.data.vehicle_class || '',
        fuel_type: raw.data.fuel_type || '',
        maker_model: raw.data.maker_model || '',
        registration_date: raw.data.registration_date || '',
        insurance_validity: raw.data.insurance_validity || '',
        fitness_validity: raw.data.fitness_validity || '',
        permit_validity: raw.data.permit_validity || null,
        challan_details: raw.data.challan_details || [],
      };

      logger.info('Vehicle RC verified successfully', {
        vehicleNumber: cleanedVehicleNumber,
        ownerName: mapped.owner_name,
      });

      return { mapped, raw };
    } catch (error) {
      if (error instanceof ValidationError || error instanceof BadRequestError) {
        throw error;
      }
      logger.error('Error verifying vehicle RC', { error, vehicleNumber });
      throw new InternalServerError('Failed to verify vehicle RC');
    }
  }

  /**
   * Fetch RC challan details via Surepass RC Related API
   */
  static async lookupRcChallanDetails(
    input: RcChallanDetailsRequest
  ): Promise<SurepassApiEnvelope<RcChallanDetailsResult>> {
    const rcNumber = input.rc_number.trim().toUpperCase().replace(/\s+/g, '');
    const chassisNumber = input.chassis_number.trim().toUpperCase().replace(/\s+/g, '');
    const engineNumber = input.engine_number.trim().toUpperCase().replace(/\s+/g, '');

    if (!rcNumber) {
      throw new ValidationError('rc_number is required');
    }
    if (!chassisNumber) {
      throw new ValidationError('chassis_number is required');
    }
    if (!engineNumber) {
      throw new ValidationError('engine_number is required');
    }

    logger.info('RC challan details lookup requested', { rcNumber });

    try {
      const config = appConfig.apis.surepass;
      const body: Record<string, unknown> = {
        rc_number: rcNumber,
        chassis_number: chassisNumber,
        engine_number: engineNumber,
        state_only: input.state_only ?? false,
      };

      if (input.state_portal !== undefined && input.state_portal.length > 0) {
        body.state_portal = input.state_portal.map((s) => s.trim().toUpperCase()).filter(Boolean);
      }

      const raw = await this.callSurepass<RcChallanDetailsResult>(
        config.rcChallanDetailsUrl,
        body,
        'RC Challan Details'
      );

      if (!raw.data) {
        throw new BadRequestError('RC challan details returned no data');
      }

      logger.info('RC challan details lookup successful', {
        rcNumber,
        challanCount: raw.data.challan_details?.challans?.length ?? 0,
      });

      return { mapped: raw.data, raw };
    } catch (error) {
      logger.error('RC challan details lookup failed', { rcNumber, error });
      if (error instanceof ValidationError || error instanceof BadRequestError) {
        throw error;
      }
      throw new InternalServerError('Failed to fetch RC challan details from external API');
    }
  }

  /**
   * Verify Indian driving licence via Surepass API (does not persist a driver record).
   */
  static async verifyDrivingLicense(
    licenseNumber: string,
    dob?: string
  ): Promise<SurepassApiEnvelope<DriverLicenseVerificationResult>> {
    const idForProvider = normalizeDrivingLicenseForProvider(licenseNumber);
    const storageForm = normalizeDrivingLicenseForStorage(licenseNumber);
    if (!idForProvider) {
      throw new ValidationError('Driving licence number is required');
    }

    if (dob !== undefined && dob !== null && String(dob).trim() !== '') {
      const dobRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dobRegex.test(String(dob).trim())) {
        throw new ValidationError('Invalid date of birth format. Expected format: YYYY-MM-DD');
      }
    }

    logger.info('Verifying driving licence via Surepass', { licenseNumber: storageForm });

    try {
      const config = appConfig.apis.surepass;
      const body: Record<string, string> = { id_number: idForProvider };
      if (dob !== undefined && dob !== null && String(dob).trim() !== '') {
        body.dob = String(dob).trim();
      }

      const raw = await this.callSurepass<NonNullable<SurepassDLVerificationResponse['data']>>(
        config.dlVerificationUrl,
        body,
        'Driving License Verification'
      );

      if (!raw.data) {
        throw new BadRequestError('No driving licence data returned from verification');
      }

      const mapped = GSTLookupService.mapSurepassDLData(storageForm, raw.data);

      if (!mapped.full_name?.trim()) {
        logger.warn('Surepass DL returned no holder name', { licenseNumber: storageForm });
        throw new BadRequestError('Driving licence holder name not found in verification response');
      }

      logger.info('Driving licence verified successfully', {
        licenseNumber: storageForm,
        fullName: mapped.full_name,
      });

      return { mapped, raw };
    } catch (error) {
      if (error instanceof ValidationError || error instanceof BadRequestError) {
        throw error;
      }
      logger.error('Error verifying driving licence', { error, licenseNumber });
      throw new InternalServerError('Failed to verify driving licence');
    }
  }

  private static mapSurepassDLData(
    licenseNumber: string,
    data: NonNullable<SurepassDLVerificationResponse['data']>
  ): DriverLicenseVerificationResult {
    const fullName =
      (data.full_name as string | undefined) ||
      (data.name as string | undefined) ||
      (data.holder_name as string | undefined) ||
      '';

    const licRaw =
      (data.license_number as string | undefined) ||
      (data.dl_number as string | undefined) ||
      (data.id_number as string | undefined) ||
      licenseNumber;
    const lic = normalizeDrivingLicenseForStorage(licRaw);

    const dob =
      (data.dob as string | undefined) ||
      (data.date_of_birth as string | undefined) ||
      (data.date_of_birth_in_words as string | undefined) ||
      '';

    const doe =
      (data.doe as string | undefined) ||
      (data.date_of_expiry as string | undefined) ||
      '';

    const age = data.age !== undefined && data.age !== null ? data.age : null;

    let address = '';
    const permanentAddress = data.permanent_address as string | undefined;
    const temporaryAddress = data.temporary_address as string | undefined;
    if (permanentAddress?.trim()) {
      address = permanentAddress.trim();
    } else if (temporaryAddress?.trim()) {
      address = temporaryAddress.trim();
    }

    const addr = data.address;
    if (!address && typeof addr === 'string') {
      address = addr;
    } else if (!address && addr && typeof addr === 'object') {
      const o = addr as Record<string, unknown>;
      const parts = [
        o.house,
        o.street,
        o.locality,
        o.landmark,
        o.city,
        o.district,
        o.state,
        o.pincode ?? o.pin_code,
      ].filter((p) => p !== undefined && p !== null && String(p).trim() !== '');
      address =
        (o.full_address as string | undefined) ||
        (o.complete_address as string | undefined) ||
        parts.map(String).join(', ');
    }

    return {
      license_number: lic,
      full_name: fullName,
      date_of_birth: dob,
      date_of_expiry: doe,
      age,
      address,
    };
  }
}

export const gstLookupService = GSTLookupService;

