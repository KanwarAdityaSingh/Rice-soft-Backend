import { logger } from '../utils/logger';
import { ValidationError, BadRequestError, InternalServerError, AppError } from '../utils/errors';
import { normalizeVehicleNumber } from '../utils/vehicle-number';
import { appConfig } from '../config/app.config';
import type { DriverLicenseVerificationResult } from '../models/driver.model';
import type { SurepassApiEnvelope, SurepassApiResponse } from '../models/kyc-verification.model';
import {
  normalizeDrivingLicenseForProvider,
  normalizeDrivingLicenseForStorage,
  normalizeDriverDobForSurepass,
  parseDrivingLicenseExpiryDate,
  parseTransportLicenseExpiryDate,
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

export interface GstinByPanListItem {
  gstin: string;
  state?: string;
  state_code?: string;
  active_status?: string;
}

export interface GstinByPanResult {
  pan_number?: string;
  client_id?: string;
  gstin_list?: GstinByPanListItem[];
}

export interface GstinByPanMapped {
  pan_number: string;
  client_id?: string;
  gstin_list: GstinByPanListItem[];
  /** Deduped GSTINs where active_status is Active (case-insensitive). */
  active_gstins: string[];
  /** First active GSTIN, if any — useful for auto-select in forms. */
  primary_gstin: string | null;
}

export interface PanToEmailMobileResult {
  client_id?: string;
  id_number?: string;
  email_id?: string[];
  mobile_number?: string[];
}

export interface PanContactMapped {
  pan_number: string;
  client_id?: string;
  email_ids: string[];
  mobile_numbers: string[];
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

/** Surepass RC Full API — comprehensive registration record. */
export interface RcFullResult {
  client_id?: string;
  rc_number: string;
  registration_date?: string | null;
  owner_name?: string | null;
  father_name?: string | null;
  present_address?: string | null;
  permanent_address?: string | null;
  mobile_number?: string | null;
  vehicle_category?: string | null;
  vehicle_chasi_number?: string | null;
  vehicle_engine_number?: string | null;
  maker_description?: string | null;
  maker_model?: string | null;
  body_type?: string | null;
  fuel_type?: string | null;
  color?: string | null;
  norms_type?: string | null;
  fit_up_to?: string | null;
  financer?: string | null;
  financed?: boolean | null;
  insurance_company?: string | null;
  insurance_policy_number?: string | null;
  insurance_upto?: string | null;
  manufacturing_date?: string | null;
  manufacturing_date_formatted?: string | null;
  registered_at?: string | null;
  latest_by?: string | null;
  less_info?: boolean | null;
  tax_upto?: string | null;
  tax_paid_upto?: string | null;
  cubic_capacity?: string | null;
  vehicle_gross_weight?: string | null;
  no_cylinders?: string | null;
  seat_capacity?: string | null;
  sleeper_capacity?: string | null;
  standing_capacity?: string | null;
  wheelbase?: string | null;
  unladen_weight?: string | null;
  vehicle_category_description?: string | null;
  pucc_number?: string | null;
  pucc_upto?: string | null;
  permit_number?: string | null;
  permit_issue_date?: string | null;
  permit_valid_from?: string | null;
  permit_valid_upto?: string | null;
  permit_type?: string | null;
  national_permit_number?: string | null;
  national_permit_upto?: string | null;
  national_permit_issued_by?: string | null;
  non_use_status?: string | null;
  non_use_from?: string | null;
  non_use_to?: string | null;
  blacklist_status?: string | null;
  noc_details?: unknown;
  owner_number?: string | null;
  rc_status?: string | null;
  masked_name?: boolean | null;
  challan_details?: unknown;
  variant?: string | null;
  [key: string]: unknown;
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
    client_id?: string;
    full_name?: string;
    name?: string;
    holder_name?: string;
    license_number?: string;
    dl_number?: string;
    id_number?: string;
    state?: string;
    dob?: string;
    date_of_birth?: string;
    date_of_birth_in_words?: string;
    doe?: string;
    date_of_expiry?: string;
    transport_doe?: string;
    doi?: string;
    transport_doi?: string;
    age?: string | number;
    gender?: string;
    blood_group?: string;
    vehicle_classes?: string[];
    father_or_husband_name?: string;
    permanent_address?: string;
    temporary_address?: string;
    permanent_zip?: string;
    temporary_zip?: string;
    profile_image?: string;
    has_image?: boolean;
    ola_name?: string;
    ola_code?: string;
    address?: string | Record<string, unknown>;
    [key: string]: unknown;
  };
}

export interface SurepassLicenseOcrResponse {
  success: boolean;
  status_code: number;
  message: string | null;
  message_code?: string;
  data?: {
    client_id?: string;
    license_number?: string;
    dob?: string;
    address?: string;
    name?: string;
    [key: string]: unknown;
  };
}

/** Normalized OCR output from Surepass licence-v2 (image/PDF scan). */
export interface DrivingLicenseOcrResult {
  client_id?: string;
  license_number: string;
  full_name: string;
  date_of_birth: string;
  address: string;
  pincode: string | null;
  state: string | null;
}

export interface SurepassOcrConfidenceValue {
  value: string | null;
  confidence?: number | null;
  is_masked?: boolean;
}

export interface SurepassGstOcrResponse {
  success: boolean;
  status_code: number;
  message: string | null;
  message_code?: string;
  data?: {
    client_id?: string;
    ocr_fields?: Array<{
      document_type?: string;
      gstin?: SurepassOcrConfidenceValue;
      standard_document?: boolean;
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  };
}

export interface GstOcrResult {
  client_id?: string;
  gstin: string;
  confidence: number | null;
  document_type: string | null;
  standard_document: boolean | null;
}

export interface SurepassPanOcrResponse {
  success: boolean;
  status_code: number;
  message: string | null;
  message_code?: string;
  data?: {
    client_id?: string;
    ocr_fields?: Array<{
      document_type?: string;
      pan_number?: SurepassOcrConfidenceValue;
      full_name?: SurepassOcrConfidenceValue;
      father_name?: SurepassOcrConfidenceValue;
      dob?: SurepassOcrConfidenceValue;
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  };
}

export interface PanOcrResult {
  client_id?: string;
  pan_number: string;
  full_name: string;
  father_name: string | null;
  date_of_birth: string | null;
  confidences?: {
    pan_number?: number | null;
    full_name?: number | null;
    father_name?: number | null;
    dob?: number | null;
  };
}

export interface SurepassAadhaarOcrResponse {
  success: boolean;
  status_code: number;
  message: string | null;
  message_code?: string;
  data?: {
    client_id?: string;
    ocr_fields?: Array<{
      document_type?: string;
      full_name?: SurepassOcrConfidenceValue;
      gender?: SurepassOcrConfidenceValue;
      mother_name?: SurepassOcrConfidenceValue;
      dob?: SurepassOcrConfidenceValue;
      aadhaar_number?: SurepassOcrConfidenceValue;
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  };
}

export interface AadhaarOcrResult {
  client_id?: string;
  aadhaar_number: string;
  full_name: string;
  gender: string | null;
  mother_name: string | null;
  date_of_birth: string | null;
  is_masked: boolean;
  document_type: string | null;
  confidences?: {
    aadhaar_number?: number | null;
    full_name?: number | null;
    gender?: number | null;
    mother_name?: number | null;
    dob?: number | null;
  };
}

export interface SurepassVehicleRcOcrResponse {
  success: boolean;
  status_code: number;
  message: string | null;
  message_code?: string;
  data?: {
    client_id?: string;
    registration_number?: string;
    chassis_number?: string | null;
    engine_number?: string | null;
    owner_name?: string | null;
    relative?: string | null;
    address?: string | null;
    fuel_used?: string | null;
    date_of_registration?: string | null;
    registration_validity?: string | null;
    owner_sr_no?: string | null;
    state?: string | null;
    vehicle_weight?: string | null;
    [key: string]: unknown;
  };
}

export interface VehicleRcOcrResult {
  client_id?: string;
  registration_number: string;
  chassis_number: string | null;
  engine_number: string | null;
  owner_name: string | null;
  relative: string | null;
  address: string | null;
  fuel_used: string | null;
  date_of_registration: string | null;
  registration_validity: string | null;
  owner_sr_no: string | null;
  state: string | null;
  vehicle_weight: string | null;
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

    const responseText = await response.text();
    let apiResponse: SurepassApiResponse<TData> | null = null;

    if (responseText) {
      try {
        apiResponse = JSON.parse(responseText) as SurepassApiResponse<TData>;
      } catch {
        logger.error(`Surepass ${logLabel} non-JSON response`, {
          status: response.status,
          statusText: response.statusText,
          error: responseText,
        });
        throw new BadRequestError(`${logLabel} failed: ${response.statusText}`);
      }
    }

    if (!response.ok || !apiResponse || apiResponse.status_code !== 200 || apiResponse.success !== true) {
      logger.warn(`Surepass ${logLabel} returned error`, {
        httpStatus: response.status,
        status_code: apiResponse?.status_code,
        message: apiResponse?.message,
        success: apiResponse?.success,
      });
      throw new BadRequestError(apiResponse?.message || `${logLabel} failed: ${response.statusText}`);
    }

    return apiResponse;
  }

  private static async callSurepassMultipart<TData>(
    url: string,
    formData: FormData,
    logLabel: string
  ): Promise<SurepassApiResponse<TData>> {
    const token = this.getSurepassToken();
    logger.debug(`Calling Surepass ${logLabel}`, { url });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    const responseText = await response.text();
    let apiResponse: SurepassApiResponse<TData> | null = null;

    if (responseText) {
      try {
        apiResponse = JSON.parse(responseText) as SurepassApiResponse<TData>;
      } catch {
        logger.error(`Surepass ${logLabel} non-JSON response`, {
          status: response.status,
          statusText: response.statusText,
          error: responseText,
        });
        throw new BadRequestError(`${logLabel} failed: ${response.statusText}`);
      }
    }

    if (!response.ok || !apiResponse || apiResponse.status_code !== 200 || apiResponse.success !== true) {
      logger.warn(`Surepass ${logLabel} returned error`, {
        httpStatus: response.status,
        status_code: apiResponse?.status_code,
        message: apiResponse?.message,
        success: apiResponse?.success,
      });
      throw new BadRequestError(apiResponse?.message || `${logLabel} failed: ${response.statusText}`);
    }

    return apiResponse;
  }

  private static buildSurepassDocumentOcrFormData(
    file: Express.Multer.File,
    options?: { usePdf?: boolean }
  ): FormData {
    if (!file.buffer?.length) {
      throw new ValidationError('file is required');
    }

    const formData = new FormData();
    formData.append(
      'file',
      new Blob([file.buffer], { type: file.mimetype }),
      file.originalname || 'document.jpg'
    );

    if (options?.usePdf !== undefined) {
      formData.append('use_pdf', options.usePdf ? 'true' : '');
    }

    return formData;
  }

  private static ocrFieldText(field: SurepassOcrConfidenceValue | undefined): string | null {
    const value = field?.value?.trim();
    return value ? value : null;
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
   * List GSTINs registered against a PAN via Surepass Corporate GSTIN-by-PAN API.
   */
  static async lookupGstinByPan(
    panNumber: string
  ): Promise<SurepassApiEnvelope<GstinByPanMapped>> {
    const pan = panNumber.trim().toUpperCase();
    if (!this.validatePANFormat(pan)) {
      throw new ValidationError('Invalid PAN number format. Expected format: ABCDE1234F');
    }

    logger.info('GSTIN-by-PAN lookup requested', { panNumber: pan });

    try {
      const config = appConfig.apis.surepass;
      const raw = await this.callSurepass<GstinByPanResult>(
        config.gstinByPanUrl,
        { id_number: pan },
        'GSTIN by PAN'
      );

      if (!raw.data) {
        throw new BadRequestError('GSTIN-by-PAN lookup returned no data');
      }

      const mapped = this.mapGstinByPanResult(pan, raw.data);
      logger.info('GSTIN-by-PAN lookup successful', {
        panNumber: pan,
        gstinCount: mapped.gstin_list.length,
        activeCount: mapped.active_gstins.length,
      });
      return { mapped, raw };
    } catch (error) {
      logger.error('GSTIN-by-PAN lookup failed', { panNumber: pan, error });
      if (error instanceof ValidationError || error instanceof BadRequestError) {
        throw error;
      }
      throw new InternalServerError('Failed to fetch GSTIN list from external API');
    }
  }

  static mapGstinByPanResult(panNumber: string, data: GstinByPanResult): GstinByPanMapped {
    const gstinList = Array.isArray(data.gstin_list) ? data.gstin_list : [];
    const activeGstins: string[] = [];
    const seenActive = new Set<string>();

    for (const item of gstinList) {
      const gstin = item.gstin?.trim().toUpperCase();
      if (!gstin) {
        continue;
      }
      const isActive = (item.active_status || '').trim().toLowerCase() === 'active';
      if (isActive && !seenActive.has(gstin)) {
        seenActive.add(gstin);
        activeGstins.push(gstin);
      }
    }

    return {
      pan_number: data.pan_number?.trim().toUpperCase() || panNumber,
      client_id: data.client_id,
      gstin_list: gstinList.map((item) => ({
        gstin: item.gstin?.trim().toUpperCase() || item.gstin,
        state: item.state,
        state_code: item.state_code,
        active_status: item.active_status,
      })),
      active_gstins: activeGstins,
      primary_gstin: activeGstins[0] ?? null,
    };
  }

  /**
   * Lookup email addresses and mobile numbers linked to a PAN via Surepass.
   */
  static async lookupPanContact(
    panNumber: string
  ): Promise<SurepassApiEnvelope<PanContactMapped>> {
    const pan = panNumber.trim().toUpperCase();
    if (!this.validatePANFormat(pan)) {
      throw new ValidationError('Invalid PAN number format. Expected format: ABCDE1234F');
    }

    logger.info('PAN contact lookup requested', { panNumber: pan });

    try {
      const config = appConfig.apis.surepass;
      const raw = await this.callSurepass<PanToEmailMobileResult>(
        config.panToEmailMobileUrl,
        { id_number: pan },
        'PAN to email/mobile'
      );

      if (!raw.data) {
        throw new BadRequestError('PAN contact lookup returned no data');
      }

      const mapped = this.mapPanContactResult(pan, raw.data);
      logger.info('PAN contact lookup successful', {
        panNumber: pan,
        emailCount: mapped.email_ids.length,
        mobileCount: mapped.mobile_numbers.length,
      });
      return { mapped, raw };
    } catch (error) {
      logger.error('PAN contact lookup failed', { panNumber: pan, error });
      if (error instanceof ValidationError || error instanceof BadRequestError) {
        throw error;
      }
      throw new InternalServerError('Failed to fetch PAN contact details from external API');
    }
  }

  static mapPanContactResult(panNumber: string, data: PanToEmailMobileResult): PanContactMapped {
    const normalizeEmail = (value: string) => value.trim().toLowerCase();
    const emailIds = Array.isArray(data.email_id)
      ? [...new Set(data.email_id.map((e) => normalizeEmail(String(e))).filter(Boolean))]
      : [];
    const mobileNumbers = Array.isArray(data.mobile_number)
      ? [...new Set(data.mobile_number.map((m) => String(m).trim()).filter(Boolean))]
      : [];

    return {
      pan_number: data.id_number?.trim().toUpperCase() || panNumber,
      client_id: data.client_id,
      email_ids: emailIds,
      mobile_numbers: mobileNumbers,
    };
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
      const cleanedVehicleNumber = normalizeVehicleNumber(vehicleNumber);

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
   * Fetch full RC details via Surepass RC Full API
   */
  static async lookupRcFull(idNumber: string): Promise<SurepassApiEnvelope<RcFullResult>> {
    const cleaned = idNumber.trim().toUpperCase().replace(/\s+/g, '');

    if (!cleaned) {
      throw new ValidationError('id_number is required');
    }

    logger.info('RC full lookup requested', { idNumber: cleaned });

    try {
      const config = appConfig.apis.surepass;
      const raw = await this.callSurepass<RcFullResult>(
        config.rcFullUrl,
        { id_number: cleaned },
        'RC Full'
      );

      if (!raw.data) {
        throw new BadRequestError('RC full lookup returned no data');
      }

      logger.info('RC full lookup successful', {
        idNumber: cleaned,
        rcNumber: raw.data.rc_number,
        ownerName: raw.data.owner_name,
      });

      return { mapped: raw.data, raw };
    } catch (error) {
      logger.error('RC full lookup failed', { idNumber: cleaned, error });
      if (error instanceof ValidationError || error instanceof BadRequestError) {
        throw error;
      }
      throw new InternalServerError('Failed to fetch RC full details from external API');
    }
  }

  /**
   * RC full lookup followed by challan details using rc/chassis/engine from the RC full response.
   * Challan failure does not fail the overall RC full result.
   */
  static async lookupRcFullWithChallanDetails(
    idNumber: string,
    challanOptions?: Pick<RcChallanDetailsRequest, 'state_only' | 'state_portal'>
  ): Promise<{
    rcFull: SurepassApiEnvelope<RcFullResult>;
    rcChallan: SurepassApiEnvelope<RcChallanDetailsResult> | null;
    rcChallanError: string | null;
  }> {
    const rcFull = await this.lookupRcFull(idNumber);
    const { rc_number, vehicle_chasi_number, vehicle_engine_number } = rcFull.mapped;

    const rcNumber = rc_number?.trim().toUpperCase().replace(/\s+/g, '') || '';
    const chassisNumber = vehicle_chasi_number?.trim().toUpperCase().replace(/\s+/g, '') || '';
    const engineNumber = vehicle_engine_number?.trim().toUpperCase().replace(/\s+/g, '') || '';

    if (!rcNumber || !chassisNumber || !engineNumber) {
      const message = 'Chassis or engine number not available from RC full response';
      logger.warn('Skipping RC challan lookup after RC full', {
        rcNumber: rcNumber || idNumber,
        hasChassis: Boolean(chassisNumber),
        hasEngine: Boolean(engineNumber),
      });
      return { rcFull, rcChallan: null, rcChallanError: message };
    }

    try {
      const rcChallan = await this.lookupRcChallanDetails({
        rc_number: rcNumber,
        chassis_number: chassisNumber,
        engine_number: engineNumber,
        state_only: challanOptions?.state_only,
        state_portal: challanOptions?.state_portal,
      });
      return { rcFull, rcChallan, rcChallanError: null };
    } catch (error) {
      const message = error instanceof AppError ? error.message : 'RC challan lookup failed';
      logger.warn('RC challan lookup failed after RC full success', {
        rcNumber,
        message,
      });
      return { rcFull, rcChallan: null, rcChallanError: message };
    }
  }

  /**
   * Extract driving licence fields from front/back images via Surepass OCR (license-v2).
   */
  static async ocrDrivingLicense(input: {
    front: Express.Multer.File;
    back?: Express.Multer.File;
    usePdf?: boolean;
  }): Promise<SurepassApiEnvelope<DrivingLicenseOcrResult>> {
    if (!input.front?.buffer?.length) {
      throw new ValidationError('front image is required');
    }

    const formData = new FormData();
    formData.append(
      'front',
      new Blob([input.front.buffer], { type: input.front.mimetype }),
      input.front.originalname || 'front.jpg'
    );

    if (input.back?.buffer?.length) {
      formData.append(
        'back',
        new Blob([input.back.buffer], { type: input.back.mimetype }),
        input.back.originalname || 'back.jpg'
      );
    }

    formData.append('use_pdf', input.usePdf ? 'true' : '');

    logger.info('Scanning driving licence via Surepass OCR');

    try {
      const config = appConfig.apis.surepass;
      const raw = await this.callSurepassMultipart<NonNullable<SurepassLicenseOcrResponse['data']>>(
        config.licenseOcrUrl,
        formData,
        'Driving License OCR'
      );

      if (!raw.data) {
        throw new BadRequestError('No driving licence data returned from OCR');
      }

      const mapped = GSTLookupService.mapSurepassLicenseOcrData(raw.data);

      if (!mapped.license_number?.trim()) {
        throw new BadRequestError('Licence number not found in OCR response');
      }
      if (!mapped.full_name?.trim()) {
        throw new BadRequestError('Holder name not found in OCR response');
      }

      logger.info('Driving licence OCR completed', {
        licenseNumber: mapped.license_number,
        fullName: mapped.full_name,
      });

      return { mapped, raw };
    } catch (error) {
      if (error instanceof ValidationError || error instanceof BadRequestError) {
        throw error;
      }
      logger.error('Error during driving licence OCR', { error });
      throw new InternalServerError('Failed to scan driving licence');
    }
  }

  private static mapSurepassLicenseOcrData(
    data: NonNullable<SurepassLicenseOcrResponse['data']>
  ): DrivingLicenseOcrResult {
    const licenseRaw = (data.license_number as string | undefined) || '';
    const license_number = normalizeDrivingLicenseForStorage(licenseRaw);
    const full_name = ((data.name as string | undefined) || '').trim().toUpperCase();
    const date_of_birth = normalizeDriverDobForSurepass(data.dob as string | undefined) || '';
    const address = ((data.address as string | undefined) || '').trim();

    const pincodeMatch = address.match(/\b(\d{6})\b/);
    const pincode = pincodeMatch ? pincodeMatch[1] : null;
    const stateMatch = address.match(/\b([A-Z]{2})\s+\d{6}\b/);
    const state = stateMatch ? stateMatch[1] : null;

    return {
      client_id: data.client_id as string | undefined,
      license_number,
      full_name,
      date_of_birth,
      address,
      pincode,
      state,
    };
  }

  /**
   * Extract GSTIN from a GST certificate/image via Surepass OCR.
   */
  static async ocrGst(input: {
    file: Express.Multer.File;
    usePdf?: boolean;
  }): Promise<SurepassApiEnvelope<GstOcrResult>> {
    const formData = this.buildSurepassDocumentOcrFormData(input.file, { usePdf: input.usePdf });
    logger.info('Scanning GST document via Surepass OCR');

    try {
      const config = appConfig.apis.surepass;
      const raw = await this.callSurepassMultipart<NonNullable<SurepassGstOcrResponse['data']>>(
        config.gstOcrUrl,
        formData,
        'GST OCR'
      );

      if (!raw.data) {
        throw new BadRequestError('No GST data returned from OCR');
      }

      const mapped = GSTLookupService.mapSurepassGstOcrData(raw.data);
      if (!mapped.gstin) {
        throw new BadRequestError('GSTIN not found in OCR response');
      }

      logger.info('GST OCR completed', { gstin: mapped.gstin });
      return { mapped, raw };
    } catch (error) {
      if (error instanceof ValidationError || error instanceof BadRequestError) {
        throw error;
      }
      logger.error('Error during GST OCR', { error });
      throw new InternalServerError('Failed to scan GST document');
    }
  }

  /**
   * Extract PAN fields from a PAN card image/PDF via Surepass OCR.
   */
  static async ocrPan(input: {
    file: Express.Multer.File;
    usePdf?: boolean;
  }): Promise<SurepassApiEnvelope<PanOcrResult>> {
    const formData = this.buildSurepassDocumentOcrFormData(input.file, { usePdf: input.usePdf });
    logger.info('Scanning PAN document via Surepass OCR');

    try {
      const config = appConfig.apis.surepass;
      const raw = await this.callSurepassMultipart<NonNullable<SurepassPanOcrResponse['data']>>(
        config.panOcrUrl,
        formData,
        'PAN OCR'
      );

      if (!raw.data) {
        throw new BadRequestError('No PAN data returned from OCR');
      }

      const mapped = GSTLookupService.mapSurepassPanOcrData(raw.data);
      if (!mapped.pan_number) {
        throw new BadRequestError('PAN number not found in OCR response');
      }
      if (!mapped.full_name) {
        throw new BadRequestError('Holder name not found in OCR response');
      }

      logger.info('PAN OCR completed', { panNumber: mapped.pan_number, fullName: mapped.full_name });
      return { mapped, raw };
    } catch (error) {
      if (error instanceof ValidationError || error instanceof BadRequestError) {
        throw error;
      }
      logger.error('Error during PAN OCR', { error });
      throw new InternalServerError('Failed to scan PAN document');
    }
  }

  /**
   * Extract Aadhaar fields from an Aadhaar card image via Surepass OCR.
   */
  static async ocrAadhaar(input: {
    file: Express.Multer.File;
    usePdf?: boolean;
  }): Promise<SurepassApiEnvelope<AadhaarOcrResult>> {
    const formData = this.buildSurepassDocumentOcrFormData(input.file, { usePdf: input.usePdf });
    logger.info('Scanning Aadhaar document via Surepass OCR');

    try {
      const config = appConfig.apis.surepass;
      const raw = await this.callSurepassMultipart<NonNullable<SurepassAadhaarOcrResponse['data']>>(
        config.aadhaarOcrUrl,
        formData,
        'Aadhaar OCR'
      );

      if (!raw.data) {
        throw new BadRequestError('No Aadhaar data returned from OCR');
      }

      const mapped = GSTLookupService.mapSurepassAadhaarOcrData(raw.data);
      if (!mapped.aadhaar_number) {
        throw new BadRequestError('Aadhaar number not found in OCR response');
      }
      if (!mapped.full_name) {
        throw new BadRequestError('Holder name not found in OCR response');
      }

      logger.info('Aadhaar OCR completed', {
        aadhaarNumber: mapped.aadhaar_number.substring(0, 4) + '********',
        fullName: mapped.full_name,
      });
      return { mapped, raw };
    } catch (error) {
      if (error instanceof ValidationError || error instanceof BadRequestError) {
        throw error;
      }
      logger.error('Error during Aadhaar OCR', { error });
      throw new InternalServerError('Failed to scan Aadhaar document');
    }
  }

  /**
   * Extract vehicle RC fields from an RC image via Surepass OCR.
   */
  static async ocrVehicleRc(input: {
    file: Express.Multer.File;
    usePdf?: boolean;
  }): Promise<SurepassApiEnvelope<VehicleRcOcrResult>> {
    const formData = this.buildSurepassDocumentOcrFormData(input.file, { usePdf: input.usePdf });
    logger.info('Scanning vehicle RC via Surepass OCR');

    try {
      const config = appConfig.apis.surepass;
      const raw = await this.callSurepassMultipart<NonNullable<SurepassVehicleRcOcrResponse['data']>>(
        config.vehicleRcOcrUrl,
        formData,
        'Vehicle RC OCR'
      );

      if (!raw.data) {
        throw new BadRequestError('No vehicle RC data returned from OCR');
      }

      const mapped = GSTLookupService.mapSurepassVehicleRcOcrData(raw.data);
      if (!mapped.registration_number) {
        throw new BadRequestError('Registration number not found in OCR response');
      }

      logger.info('Vehicle RC OCR completed', {
        registrationNumber: mapped.registration_number,
        ownerName: mapped.owner_name,
      });
      return { mapped, raw };
    } catch (error) {
      if (error instanceof ValidationError || error instanceof BadRequestError) {
        throw error;
      }
      logger.error('Error during vehicle RC OCR', { error });
      throw new InternalServerError('Failed to scan vehicle RC');
    }
  }

  private static mapSurepassGstOcrData(
    data: NonNullable<SurepassGstOcrResponse['data']>
  ): GstOcrResult {
    const field =
      data.ocr_fields?.find((item) => this.ocrFieldText(item.gstin)) ??
      data.ocr_fields?.[0];

    const gstinRaw = this.ocrFieldText(field?.gstin) || '';
    const gstin = gstinRaw.trim().toUpperCase();

    return {
      client_id: data.client_id as string | undefined,
      gstin,
      confidence: field?.gstin?.confidence ?? null,
      document_type: (field?.document_type as string | undefined)?.trim() || null,
      standard_document:
        typeof field?.standard_document === 'boolean' ? field.standard_document : null,
    };
  }

  private static mapSurepassPanOcrData(
    data: NonNullable<SurepassPanOcrResponse['data']>
  ): PanOcrResult {
    const field =
      data.ocr_fields?.find((item) => this.ocrFieldText(item.pan_number)) ??
      data.ocr_fields?.[0];

    const pan_number = (this.ocrFieldText(field?.pan_number) || '').trim().toUpperCase();
    const full_name = (this.ocrFieldText(field?.full_name) || '').trim().toUpperCase();
    const father_name = this.ocrFieldText(field?.father_name);
    const date_of_birth = normalizeDriverDobForSurepass(this.ocrFieldText(field?.dob) || undefined);

    return {
      client_id: data.client_id as string | undefined,
      pan_number,
      full_name,
      father_name,
      date_of_birth,
      confidences: {
        pan_number: field?.pan_number?.confidence ?? null,
        full_name: field?.full_name?.confidence ?? null,
        father_name: field?.father_name?.confidence ?? null,
        dob: field?.dob?.confidence ?? null,
      },
    };
  }

  private static mapSurepassAadhaarOcrData(
    data: NonNullable<SurepassAadhaarOcrResponse['data']>
  ): AadhaarOcrResult {
    const field =
      data.ocr_fields?.find((item) => this.ocrFieldText(item.aadhaar_number)) ??
      data.ocr_fields?.[0];

    const aadhaarRaw = (this.ocrFieldText(field?.aadhaar_number) || '').replace(/\s/g, '');
    const full_name = (this.ocrFieldText(field?.full_name) || '').trim().toUpperCase();
    const gender = this.ocrFieldText(field?.gender);
    const mother_name = this.ocrFieldText(field?.mother_name);
    const date_of_birth = normalizeDriverDobForSurepass(this.ocrFieldText(field?.dob) || undefined);

    return {
      client_id: data.client_id as string | undefined,
      aadhaar_number: aadhaarRaw,
      full_name,
      gender,
      mother_name,
      date_of_birth,
      is_masked: field?.aadhaar_number?.is_masked === true,
      document_type: (field?.document_type as string | undefined)?.trim() || null,
      confidences: {
        aadhaar_number: field?.aadhaar_number?.confidence ?? null,
        full_name: field?.full_name?.confidence ?? null,
        gender: field?.gender?.confidence ?? null,
        mother_name: field?.mother_name?.confidence ?? null,
        dob: field?.dob?.confidence ?? null,
      },
    };
  }

  private static mapSurepassVehicleRcOcrData(
    data: NonNullable<SurepassVehicleRcOcrResponse['data']>
  ): VehicleRcOcrResult {
    const registrationRaw = (data.registration_number as string | undefined) || '';
    const registration_number = registrationRaw.trim()
      ? normalizeVehicleNumber(registrationRaw)
      : '';

    return {
      client_id: data.client_id as string | undefined,
      registration_number,
      chassis_number: ((data.chassis_number as string | undefined) || '').trim() || null,
      engine_number: ((data.engine_number as string | undefined) || '').trim() || null,
      owner_name: ((data.owner_name as string | undefined) || '').trim().toUpperCase() || null,
      relative: ((data.relative as string | undefined) || '').trim() || null,
      address: ((data.address as string | undefined) || '').trim() || null,
      fuel_used: ((data.fuel_used as string | undefined) || '').trim().toUpperCase() || null,
      date_of_registration:
        ((data.date_of_registration as string | undefined) || '').trim() || null,
      registration_validity:
        ((data.registration_validity as string | undefined) || '').trim() || null,
      owner_sr_no: ((data.owner_sr_no as string | undefined) || '').trim() || null,
      state: ((data.state as string | undefined) || '').trim() || null,
      vehicle_weight:
        data.vehicle_weight === null || data.vehicle_weight === undefined
          ? null
          : String(data.vehicle_weight).trim() || null,
    };
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

    let normalizedDob: string | null = null;
    if (dob !== undefined && dob !== null && String(dob).trim() !== '') {
      normalizedDob = normalizeDriverDobForSurepass(dob);
      if (!normalizedDob) {
        throw new ValidationError(
          'Invalid date of birth format. Use YYYY-MM-DD, DD-MM-YYYY, or ISO date'
        );
      }
    }

    logger.info('Verifying driving licence via Surepass', { licenseNumber: storageForm });

    try {
      const config = appConfig.apis.surepass;
      const body: Record<string, string> = { id_number: idForProvider };
      if (normalizedDob) {
        body.dob = normalizedDob;
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
      parseDrivingLicenseExpiryDate(
        (data.doe as string | undefined) || (data.date_of_expiry as string | undefined)
      ) || '';

    const age = data.age !== undefined && data.age !== null ? data.age : null;

    let address = '';
    const permanentAddress = data.permanent_address as string | undefined;
    const temporaryAddress = data.temporary_address as string | undefined;
    if (permanentAddress?.trim()) {
      address = permanentAddress.trim();
      const zip = (data.permanent_zip as string | undefined)?.trim();
      if (zip) {
        address = `${address}, ${zip}`;
      }
    } else if (temporaryAddress?.trim()) {
      address = temporaryAddress.trim();
      const zip = (data.temporary_zip as string | undefined)?.trim();
      if (zip) {
        address = `${address}, ${zip}`;
      }
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

    const vehicleClasses = Array.isArray(data.vehicle_classes)
      ? data.vehicle_classes.map(String)
      : undefined;

    const pincode =
      (data.permanent_zip as string | undefined)?.trim() ||
      (data.temporary_zip as string | undefined)?.trim() ||
      null;

    return {
      license_number: lic,
      full_name: fullName,
      date_of_birth: dob,
      date_of_expiry: doe,
      age,
      address,
      pincode,
      state: (data.state as string | undefined)?.trim() || null,
      city_name:
        (data.city_name as string | undefined)?.trim() ||
        (data.ola_name as string | undefined)?.trim() ||
        null,
      gender: (data.gender as string | undefined)?.trim() || null,
      blood_group: (data.blood_group as string | undefined)?.trim() || null,
      vehicle_classes: vehicleClasses,
      father_or_husband_name: (data.father_or_husband_name as string | undefined)?.trim() || null,
      date_of_issue: (data.doi as string | undefined)?.trim() || null,
      transport_date_of_expiry: parseTransportLicenseExpiryDate(
        data.transport_doe as string | undefined
      ),
      profile_image: (data.profile_image as string | undefined) || null,
      has_image: data.has_image === true,
      ola_name: (data.ola_name as string | undefined)?.trim() || null,
      ola_code: (data.ola_code as string | undefined)?.trim() || null,
    };
  }
}

export const gstLookupService = GSTLookupService;

